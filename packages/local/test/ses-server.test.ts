import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    expect(list.messages).toEqual([{ id: result.MessageId, fromAddress: 'sender@example.com', toAddresses: ['recipient@example.com'], ccAddresses: [], bccAddresses: [], subject: 'テスト', receivedAt: expect.any(String), size: expect.any(Number) }]);

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

describe('viewer API', () => {
  const seed = async (): Promise<{ url: string; id: string }> => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-api-'));
    temporaryDirectories.push(directory);
    const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
    servers.push(server);

    const response = await fetch(`${server.url}/v2/email/outbound-emails`, {
      method: 'POST',
      headers: { 'x-amz-target': 'AmazonSimpleEmailServiceV2.SendEmail' },
      body: JSON.stringify({
        FromEmailAddress: 'sender@example.com',
        Destination: { ToAddresses: ['recipient@example.com'] },
        EmailTags: [{ Name: 'campaign', Value: 'spring' }],
        Content: {
          Simple: {
            Subject: { Data: 'Receipt' },
            Body: { Text: { Data: 'plain body' }, Html: { Data: '<p>html body</p>' } },
            Attachments: [{
              FileName: 'invoice.pdf',
              ContentType: 'application/pdf',
              RawContent: Buffer.from('%PDF-1.4').toString('base64'),
            }],
          },
        },
      }),
    });

    const { MessageId } = await response.json() as { MessageId: string };
    return { url: server.url, id: MessageId };
  };

  it('lists captured messages without synthetic metadata', async () => {
    const { url } = await seed();

    const response = await fetch(`${url}/api/messages`);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = await response.json() as { messages: Array<{ subject: string }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).not.toHaveProperty('mailbox');
  });

  it('returns the decoded body parts and attachment metadata', async () => {
    const { url, id } = await seed();

    const detail = await (await fetch(`${url}/api/messages/${id}`)).json() as {
      content: { text?: string; html?: string; attachments: Array<{ index: number; filename: string; size: number }> };
      replyToAddresses: string[];
    };

    expect(detail.content.text).toContain('plain body');
    expect(detail.content.html).toContain('<p>html body</p>');
    expect(detail.content.attachments).toEqual([
      { index: 0, filename: 'invoice.pdf', contentType: 'application/pdf', size: 8, inline: false },
    ]);
  });

  it('downloads an attachment with its own content type', async () => {
    const { url, id } = await seed();

    const response = await fetch(`${url}/api/messages/${id}/attachments/0`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('invoice.pdf');
    expect(await response.text()).toBe('%PDF-1.4');
  });

  it('reports missing messages and attachments', async () => {
    const { url, id } = await seed();

    expect((await fetch(`${url}/api/messages/does-not-exist`)).status).toBe(404);
    expect((await fetch(`${url}/api/messages/${id}/attachments/9`)).status).toBe(404);
  });

  it('keeps serving the original store routes', async () => {
    const { url, id } = await seed();

    expect((await fetch(`${url}/health-check`)).status).toBe(200);
    expect((await fetch(`${url}/api/health`)).status).toBe(200);

    const legacy = await (await fetch(`${url}/store/${id}`)).json() as { rawMime: string };
    expect(Buffer.from(legacy.rawMime, 'base64').toString('utf8')).toContain('Subject: Receipt');
  });
});

describe('viewer assets', () => {
  it('serves the bundle when one has been built', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-bundle-'));
    temporaryDirectories.push(directory);
    const viewerDir = join(directory, 'viewer');
    await mkdir(viewerDir);
    await writeFile(join(viewerDir, 'index.html'), '<!doctype html><div id="root"></div>');

    const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0, viewerDir });
    servers.push(server);

    expect(server.viewerEnabled).toBe(true);
    const response = await fetch(`${server.url}/`);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('id="root"');
  });

  it('falls back to an endpoint listing when no bundle is present', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-nobundle-'));
    temporaryDirectories.push(directory);

    const server = await startServer({
      dbPath: join(directory, 'mailbox.sqlite3'),
      port: 0,
      viewerDir: join(directory, 'missing'),
    });
    servers.push(server);

    expect(server.viewerEnabled).toBe(false);
    const body = await (await fetch(`${server.url}/`)).json() as { viewer: string; endpoints: string[] };
    expect(body.viewer).toBe('not built');
    expect(body.endpoints).toContain('GET /api/messages');
  });
});
