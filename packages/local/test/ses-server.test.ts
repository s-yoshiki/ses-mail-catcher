import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HOST_ENV, PORT_ENV } from '../src/options.js';
import { startServer } from '../src/ses-server.js';

const temporaryDirectories: string[] = [];
const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local SES server', () => {
  it('accepts SES v2 SendEmail and exposes the stored message', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-server-'));
    temporaryDirectories.push(directory);
    const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
    servers.push(server);

    const response = await fetch(`${server.url}/v2/email/outbound-emails`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AmazonSimpleEmailServiceV2.SendEmail' },
      body: JSON.stringify({
        FromEmailAddress: 'sender@example.com',
        Destination: { ToAddresses: ['recipient@example.com'] },
        Content: {
          Simple: {
            Subject: { Data: 'テスト' },
            Body: { Text: { Data: '本文' } },
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json() as { MessageId: string };
    expect(result.MessageId).toEqual(expect.any(String));

    const listResponse = await fetch(`${server.url}/store`);
    const list = await listResponse.json() as { messages: Array<{ id: string; subject: string }> };
    expect(list.messages).toEqual([{ id: result.MessageId, fromAddress: 'sender@example.com', toAddresses: ['recipient@example.com'], ccAddresses: [], bccAddresses: [], subject: 'テスト', receivedAt: expect.any(String), size: expect.any(Number), mailbox: 'default' }]);

    const rawResponse = await fetch(`${server.url}/store/${result.MessageId}/raw`);
    expect(await rawResponse.text()).toContain('Subject: =?UTF-8?B?');
  });

  it('accepts Raw content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-raw-'));
    temporaryDirectories.push(directory);
    const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
    servers.push(server);

    const raw = 'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Raw\r\n\r\nBody';
    const response = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'x-amz-target': 'com.amazonaws.ses.v2.SESv2.SendEmail' },
      body: JSON.stringify({ Content: { Raw: { Data: Buffer.from(raw).toString('base64') } } }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).MessageId).toEqual(expect.any(String));
    expect((await fetch(`${server.url}/health-check`)).status).toBe(200);
  });

  it('binds to the host and port given in the environment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-env-'));
    temporaryDirectories.push(directory);
    // The container image relies on this to publish the port beyond loopback.
    vi.stubEnv(HOST_ENV, 'localhost');
    vi.stubEnv(PORT_ENV, '0');

    const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3') });
    servers.push(server);

    expect(server.host).toBe('localhost');
    expect(server.port).toBeGreaterThan(0);
    expect((await fetch(`${server.url}/health-check`)).status).toBe(200);
  });
});
