import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  apiErrorSchema,
  healthResponseSchema,
  messageDetailSchema,
  messageListResponseSchema,
} from 'ses-mail-catcher-api-contract';
import { afterEach, expect, it } from 'vitest';

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
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const seed = async (): Promise<{ url: string; id: string }> => {
  const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-api-'));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
  servers.push(server);

  const response = await postSes(server.url, {
    FromEmailAddress: 'sender@example.com',
    Destination: { ToAddresses: ['recipient@example.com'] },
    EmailTags: [{ Name: 'mailbox', Value: 'orders' }],
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

  const { MessageId } = await response.json() as { MessageId: string };
  return { url: server.url, id: MessageId };
};

it('lists messages together with the known mailboxes', async () => {
  const { url } = await seed();

  const response = await fetch(`${url}/api/messages`);
  expect(response.headers.get('content-type')).toContain('application/json');

  const body = messageListResponseSchema.parse(await response.json());
  expect(body.messages).toHaveLength(1);
  expect(body.mailboxes).toEqual(['orders']);
});

it('filters the list by mailbox', async () => {
  const { url } = await seed();

  const matching = await (await fetch(`${url}/api/messages?mailbox=orders`)).json() as { messages: unknown[] };
  const other = await (await fetch(`${url}/api/messages?mailbox=default`)).json() as { messages: unknown[] };

  expect(matching.messages).toHaveLength(1);
  expect(other.messages).toHaveLength(0);
});

it('honours the list limit while retaining the response contract', async () => {
  const first = await seed();
  const secondResponse = await postSes(first.url, {
    FromEmailAddress: 'second@example.com',
    Destination: { ToAddresses: ['recipient@example.com'] },
    EmailTags: [{ Name: 'mailbox', Value: 'orders' }],
    Content: {
      Simple: {
        Subject: { Data: 'Second receipt' },
        Body: { Text: { Data: 'second body' } },
      },
    },
  });
  expect(secondResponse.status).toBe(200);

  const limited = messageListResponseSchema.parse(
    await (await fetch(`${first.url}/api/messages?limit=1`)).json(),
  );
  expect(limited.messages).toHaveLength(1);
  expect(limited.mailboxes).toEqual(['orders']);

  const zero = messageListResponseSchema.parse(
    await (await fetch(`${first.url}/api/messages?limit=0`)).json(),
  );
  expect(zero.messages).toHaveLength(1);
});

it('returns the decoded body parts and attachment metadata', async () => {
  const { url, id } = await seed();

  const detail = messageDetailSchema.parse(await (await fetch(`${url}/api/messages/${id}`)).json());

  expect(detail.content.text).toContain('plain body');
  expect(detail.content.html).toContain('<p>html body</p>');
  expect(detail.content.attachments).toEqual([{
    index: 0,
    filename: 'invoice.pdf',
    contentType: 'application/pdf',
    size: 8,
    inline: false,
  }]);
});

it('downloads an attachment with its own content type', async () => {
  const { url, id } = await seed();

  const response = await fetch(`${url}/api/messages/${id}/attachments/0`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('content-disposition')).toContain('invoice.pdf');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode('%PDF-1.4'));
});

it('reports missing messages and attachments', async () => {
  const { url, id } = await seed();

  const missingMessage = await fetch(`${url}/api/messages/does-not-exist`);
  const missingAttachment = await fetch(`${url}/api/messages/${id}/attachments/9`);
  expect(missingMessage.status).toBe(404);
  expect(missingAttachment.status).toBe(404);
  expect(apiErrorSchema.parse(await missingMessage.json())).toEqual({ message: 'Message not found' });
  expect(apiErrorSchema.parse(await missingAttachment.json())).toEqual({ message: 'Attachment not found' });
});

it('keeps serving the original store routes', async () => {
  const { url, id } = await seed();

  const health = await fetch(`${url}/health-check`);
  const apiHealth = await fetch(`${url}/api/health`);
  expect(health.status).toBe(200);
  expect(apiHealth.status).toBe(200);
  expect(healthResponseSchema.parse(await health.json())).toEqual({ status: 'ok' });
  expect(healthResponseSchema.parse(await apiHealth.json())).toEqual({ status: 'ok' });

  const legacy = await (await fetch(`${url}/store/${id}`)).json() as { rawMime: string };
  expect(Buffer.from(legacy.rawMime, 'base64').toString('utf8')).toContain('Subject: Receipt');
  const legacyRaw = await fetch(`${url}/store/${id}/raw`);
  expect(legacyRaw.status).toBe(200);
  expect(await legacyRaw.text()).toContain('Subject: Receipt');

  const legacyList = await (await fetch(`${url}/store`)).json() as { messages: unknown[] };
  expect(legacyList.messages).toHaveLength(1);
});

it('returns JSON 404s for unknown routes and methods', async () => {
  const { url } = await seed();

  const unknown = await fetch(`${url}/api/not-a-route`);
  expect(unknown.status).toBe(404);
  expect(apiErrorSchema.parse(await unknown.json())).toEqual({ message: 'Not found' });

  const method = await fetch(`${url}/api/messages`, { method: 'POST', body: '{}' });
  expect(method.status).toBe(404);
  expect(apiErrorSchema.parse(await method.json())).toEqual({ message: 'Not found' });
});
