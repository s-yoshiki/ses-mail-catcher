import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  apiErrorSchema,
  deleteMessagesResponseSchema,
  messageListResponseSchema,
} from '@ses-mail-catcher/api-contract';
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
  const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-delete-'));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
  servers.push(server);

  const response = await postSes(server.url, {
    FromEmailAddress: 'sender@example.com',
    Destination: { ToAddresses: ['recipient@example.com'] },
    Content: {
      Simple: {
        Subject: { Data: 'Receipt' },
        Body: { Text: { Data: 'plain body' } },
      },
    },
  });

  const { MessageId } = await response.json() as { MessageId: string };
  return { url: server.url, id: MessageId };
};

it('deletes a single message', async () => {
  const { url, id } = await seed();

  const deleteResponse = await fetch(`${url}/api/messages/${id}`, { method: 'DELETE' });
  expect(deleteResponse.status).toBe(204);
  expect(await deleteResponse.text()).toBe('');

  const getResponse = await fetch(`${url}/api/messages/${id}`);
  expect(getResponse.status).toBe(404);
  expect(apiErrorSchema.parse(await getResponse.json())).toEqual({ message: 'Message not found' });
});

it('reports a 404 when deleting a message that does not exist', async () => {
  const { url } = await seed();

  const response = await fetch(`${url}/api/messages/does-not-exist`, { method: 'DELETE' });
  expect(response.status).toBe(404);
  expect(apiErrorSchema.parse(await response.json())).toEqual({ message: 'Message not found' });
});

it('deletes every message and reports the deleted count with the shared response contract', async () => {
  const { url } = await seed();

  const response = await fetch(`${url}/api/messages`, { method: 'DELETE' });
  expect(response.status).toBe(200);
  expect(deleteMessagesResponseSchema.parse(await response.json())).toEqual({ deletedCount: 1, hasMore: false });

  const list = messageListResponseSchema.parse(await (await fetch(`${url}/api/messages`)).json());
  expect(list.messages).toEqual([]);
});

it('rejects a cross-site delete request and keeps the message', async () => {
  const { url, id } = await seed();

  const response = await fetch(`${url}/api/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  expect(response.status).toBe(403);
  expect(apiErrorSchema.parse(await response.json())).toEqual({ message: 'Cross-origin requests are not allowed' });

  const getResponse = await fetch(`${url}/api/messages/${id}`);
  expect(getResponse.status).toBe(200);
});

it('rejects a cross-site delete request even when the Origin host matches Host', async () => {
  const { url, id } = await seed();

  const response = await fetch(`${url}/api/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Sec-Fetch-Site': 'cross-site', Origin: url },
  });
  expect(response.status).toBe(403);
  expect(apiErrorSchema.parse(await response.json())).toEqual({ message: 'Cross-origin requests are not allowed' });

  const getResponse = await fetch(`${url}/api/messages/${id}`);
  expect(getResponse.status).toBe(200);
});

it('rejects a delete request with a mismatched Origin header', async () => {
  const { url, id } = await seed();

  const response = await fetch(`${url}/api/messages/${id}`, {
    method: 'DELETE',
    headers: { Origin: 'https://attacker.example' },
  });
  expect(response.status).toBe(403);
  expect(apiErrorSchema.parse(await response.json())).toEqual({ message: 'Cross-origin requests are not allowed' });

  const getResponse = await fetch(`${url}/api/messages/${id}`);
  expect(getResponse.status).toBe(200);
});

it('allows a delete request with a matching Origin header', async () => {
  const { url, id } = await seed();

  const response = await fetch(`${url}/api/messages/${id}`, {
    method: 'DELETE',
    headers: { Origin: url },
  });
  expect(response.status).toBe(204);
});

it('allows a same-origin delete request through a proxy that rewrites Host, even with a mismatched Origin', async () => {
  const { url, id } = await seed();

  // Mirrors a dev proxy (e.g. Vite's `changeOrigin: true`) that rewrites the
  // Host header to the local backend while the browser still reports the
  // original page origin via Sec-Fetch-Site: same-origin. Origin here is
  // deliberately a different origin than `url`'s host, and must still pass.
  const response = await fetch(`${url}/api/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:5173' },
  });
  expect(response.status).toBe(204);
});

it('returns JSON 404s for DELETE on unknown routes', async () => {
  const { url } = await seed();

  const response = await fetch(`${url}/api/not-a-route`, { method: 'DELETE' });
  expect(response.status).toBe(404);
  expect(apiErrorSchema.parse(await response.json())).toEqual({ message: 'Not found' });
});
