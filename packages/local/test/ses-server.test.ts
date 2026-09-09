import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  apiErrorSchema,
  healthResponseSchema,
  messageDetailSchema,
  messageListResponseSchema,
} from '@ses-mail-catcher/api-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HOST_ENV, PORT_ENV } from '../src/options.js';
import { startServer } from '../src/ses-server.js';

const SES_TARGET = 'AmazonSimpleEmailServiceV2.SendEmail';
const temporaryDirectories: string[] = [];
const servers: Array<{ close(): Promise<void> }> = [];

const openServer = async (prefix: string, options: { viewerDir?: string } = {}) => {
  const directory = await mkdtemp(join(tmpdir(), `ses-mail-catcher-${prefix}-`));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0, ...options });
  servers.push(server);
  return server;
};

const postSes = (url: string, body: unknown, target = SES_TARGET): Promise<Response> => {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': target },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local SES server', () => {
  it('accepts SES v2 SendEmail and exposes the stored message', async () => {
    const server = await openServer('server');

    const response = await postSes(`${server.url}/v2/email/outbound-emails`, {
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
    expect(response.headers.get('content-type')).toContain('application/x-amz-json-1.1');
    const result = await response.json() as { MessageId: string };
    expect(result.MessageId).toEqual(expect.any(String));

    const listResponse = await fetch(`${server.url}/store`);
    const list = messageListResponseSchema.parse(await listResponse.json());
    expect(list.messages).toEqual([{ id: result.MessageId, fromAddress: 'sender@example.com', toAddresses: ['recipient@example.com'], ccAddresses: [], bccAddresses: [], subject: 'テスト', receivedAt: expect.any(String), size: expect.any(Number) }]);

    const rawResponse = await fetch(`${server.url}/store/${result.MessageId}/raw`);
    expect(rawResponse.headers.get('content-type')).toBe('message/rfc822');
    expect(Buffer.from(await rawResponse.arrayBuffer()).toString('utf8')).toContain('Subject: =?UTF-8?B?');
  });

  it('accepts Raw content', async () => {
    const server = await openServer('raw');

    const raw = 'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Raw\r\n\r\nBody';
    const response = await postSes(`${server.url}/`, {
      Content: { Raw: { Data: Buffer.from(raw).toString('base64') } },
    }, 'com.amazonaws.ses.v2.SESv2.SendRawEmail');

    expect(response.status).toBe(200);
    const { MessageId } = await response.json() as { MessageId: string };
    expect(MessageId).toEqual(expect.any(String));

    const detail = messageDetailSchema.parse(await (await fetch(`${server.url}/api/messages/${MessageId}`)).json());
    expect(detail.subject).toBe('Raw');

    const rawResponse = await fetch(`${server.url}/api/messages/${MessageId}/raw`);
    expect(rawResponse.status).toBe(200);
    expect(Buffer.from(await rawResponse.arrayBuffer()).toString('utf8')).toBe(raw);

    const health = healthResponseSchema.parse(await (await fetch(`${server.url}/health-check`)).json());
    expect(health).toEqual({ status: 'ok' });
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
    const server = await openServer('api');

    const response = await postSes(`${server.url}/v2/email/outbound-emails`, {
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
    });

    expect(response.status).toBe(200);
    const { MessageId } = await response.json() as { MessageId: string };
    return { url: server.url, id: MessageId };
  };

  it('lists captured messages without synthetic metadata', async () => {
    const { url } = await seed();

    const response = await fetch(`${url}/api/messages`);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = messageListResponseSchema.parse(await response.json());
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).not.toHaveProperty('mailbox');
  });

  it('returns the decoded body parts and attachment metadata', async () => {
    const { url, id } = await seed();

    const detail = messageDetailSchema.parse(await (await fetch(`${url}/api/messages/${id}`)).json());

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
    expect(Buffer.from(await response.arrayBuffer()).toString('utf8')).toBe('%PDF-1.4');
  });

  it('reports missing messages and attachments', async () => {
    const { url, id } = await seed();

    const missingMessage = await fetch(`${url}/api/messages/does-not-exist`);
    expect(missingMessage.status).toBe(404);
    expect(apiErrorSchema.parse(await missingMessage.json())).toEqual({ message: 'Message not found' });

    const missingAttachment = await fetch(`${url}/api/messages/${id}/attachments/9`);
    expect(missingAttachment.status).toBe(404);
    expect(apiErrorSchema.parse(await missingAttachment.json())).toEqual({ message: 'Attachment not found' });
  });

  it('keeps serving the original store routes', async () => {
    const { url, id } = await seed();

    expect(healthResponseSchema.parse(await (await fetch(`${url}/health-check`)).json())).toEqual({ status: 'ok' });
    expect(healthResponseSchema.parse(await (await fetch(`${url}/api/health`)).json())).toEqual({ status: 'ok' });

    const apiList = messageListResponseSchema.parse(await (await fetch(`${url}/api/messages`)).json());
    const storeList = messageListResponseSchema.parse(await (await fetch(`${url}/store`)).json());
    expect(storeList).toEqual(apiList);

    const legacy = await (await fetch(`${url}/store/${id}`)).json() as { rawMime: string };
    expect(Buffer.from(legacy.rawMime, 'base64').toString('utf8')).toContain('Subject: Receipt');

    const storeRaw = await fetch(`${url}/store/${id}/raw`);
    expect(storeRaw.headers.get('content-type')).toBe('message/rfc822');
    expect(Buffer.from(await storeRaw.arrayBuffer()).toString('utf8')).toContain('Subject: Receipt');
  });
});

describe('viewer assets', () => {
  it('serves the bundle when one has been built', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-bundle-'));
    temporaryDirectories.push(directory);
    const viewerDir = join(directory, 'viewer');
    await mkdir(join(viewerDir, 'assets'), { recursive: true });
    await writeFile(join(viewerDir, 'index.html'), '<!doctype html><div id="root"></div>');
    await writeFile(join(viewerDir, 'assets', 'index-abc.js'), 'console.log(1);');

    const server = await openServer('bundle', { viewerDir });

    expect(server.viewerEnabled).toBe(true);
    const response = await fetch(`${server.url}/`);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('id="root"');

    const asset = await fetch(`${server.url}/assets/index-abc.js`);
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(await asset.text()).toBe('console.log(1);');
  });

  it('falls back to an endpoint listing when no bundle is present', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-nobundle-'));
    temporaryDirectories.push(directory);

    const server = await openServer('nobundle', { viewerDir: join(directory, 'missing') });

    expect(server.viewerEnabled).toBe(false);
    const body = await (await fetch(`${server.url}/`)).json() as { viewer: string; endpoints: string[] };
    expect(body.viewer).toBe('not built');
    expect(body.endpoints).toContain('GET /api/messages');
  });
});
