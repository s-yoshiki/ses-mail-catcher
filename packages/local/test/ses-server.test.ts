import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  messageDetailSchema,
  messageListResponseSchema,
} from 'ses-mail-catcher-api-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HOST_ENV, PORT_ENV } from '../src/options.js';
import { startServer } from '../src/ses-server.js';

const temporaryDirectories: string[] = [];
const servers: Array<{ close(): Promise<void> }> = [];

const postSes = (
  url: string,
  body: unknown,
  target = 'AmazonSimpleEmailServiceV2.SendEmail',
): Promise<Response> => {
  return fetch(`${url}/v2/email/outbound-emails`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': target,
    },
    body: JSON.stringify(body),
  });
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it('accepts SES v2 SendEmail and exposes the stored message', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-server-'));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
  servers.push(server);

  const response = await postSes(server.url, {
    FromEmailAddress: 'sender@example.com',
    Destination: { ToAddresses: ['recipient@example.com'] },
    Content: {
      Simple: {
        Subject: { Data: 'テスト' },
        Body: { Text: { Data: '本文' } },
      },
    },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/x-amz-json-1.1; charset=utf-8');
  const result = await response.json() as { MessageId: string };
  expect(result.MessageId).toEqual(expect.any(String));

  const apiResponse = await fetch(`${server.url}/api/messages`);
  expect(messageListResponseSchema.parse(await apiResponse.json())).toMatchObject({
    messages: [{
      id: result.MessageId,
      fromAddress: 'sender@example.com',
      toAddresses: ['recipient@example.com'],
      ccAddresses: [],
      bccAddresses: [],
      subject: 'テスト',
      size: expect.any(Number),
      mailbox: 'default',
    }],
    mailboxes: ['default'],
  });

  const listResponse = await fetch(`${server.url}/store`);
  const list = await listResponse.json() as { messages: Array<{ id: string; subject: string }> };
  expect(list.messages).toEqual([{ id: result.MessageId, fromAddress: 'sender@example.com', toAddresses: ['recipient@example.com'], ccAddresses: [], bccAddresses: [], subject: 'テスト', receivedAt: expect.any(String), size: expect.any(Number), mailbox: 'default' }]);

  const rawResponse = await fetch(`${server.url}/store/${result.MessageId}/raw`);
  expect(rawResponse.headers.get('content-type')).toBe('message/rfc822');
  expect(await rawResponse.text()).toContain('Subject: =?UTF-8?B?');
});

it('accepts SES SendRawEmail with RawMessage content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-raw-'));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
  servers.push(server);

  const raw = 'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Raw\r\n\r\nBody';
  const response = await postSes(
    server.url,
    { RawMessage: { Data: Buffer.from(raw).toString('base64') } },
    'AmazonSimpleEmailServiceV2.SendRawEmail',
  );

  expect(response.status).toBe(200);
  const { MessageId } = await response.json() as { MessageId: string };
  expect(MessageId).toEqual(expect.any(String));
  const detail = messageDetailSchema.parse(await (await fetch(`${server.url}/api/messages/${MessageId}`)).json());
  expect(detail).toMatchObject({
    id: MessageId,
    fromAddress: 'sender@example.com',
    toAddresses: ['recipient@example.com'],
    subject: 'Raw',
    content: { attachments: [] },
  });
  expect(detail.content.text).toContain('Body');
  const rawResponse = await fetch(`${server.url}/api/messages/${MessageId}/raw`);
  expect(Buffer.from(await rawResponse.arrayBuffer()).equals(Buffer.from(raw))).toBe(true);

  const contentRawResponse = await postSes(server.url, {
    Content: { Raw: { Data: Buffer.from(raw).toString('base64') } },
  });
  expect(contentRawResponse.status).toBe(200);
  const contentRawId = (await contentRawResponse.json() as { MessageId: string }).MessageId;
  expect(contentRawId).toEqual(expect.any(String));
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
