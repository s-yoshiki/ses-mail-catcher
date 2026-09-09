import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  apiErrorSchema,
  messageListResponseSchema,
} from '@ses-mail-catcher/api-contract';
import { afterEach, expect, test } from 'vitest';

import { startServer } from '../src/ses-server.js';

const SES_TARGET = 'AmazonSimpleEmailServiceV2.SendEmail';
const temporaryDirectories: string[] = [];
const servers: Array<{ close(): Promise<void> }> = [];

const openServer = async (prefix: string) => {
  const directory = await mkdtemp(join(tmpdir(), `ses-mail-catcher-${prefix}-`));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0, viewerDir: join(directory, 'missing') });
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
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('local SES API returns stable errors for invalid input and unknown routes', async () => {
  const server = await openServer('invalid');

  const malformed = await postSes(`${server.url}/v2/email/outbound-emails`, '{');
  expect(malformed.status).toBe(400);
  const malformedBody = await malformed.json() as { __type: string; message: string };
  expect(malformedBody['__type']).toBe('InvalidParameterValue');
  expect(apiErrorSchema.parse(malformedBody).message).toContain('JSON');

  const nonObject = await postSes(`${server.url}/v2/email/outbound-emails`, '[]');
  expect(nonObject.status).toBe(400);
  expect(apiErrorSchema.parse(await nonObject.json()).message).toBe('Request body must be a JSON object');

  const unsupported = await postSes(
    `${server.url}/v2/email/outbound-emails`,
    { Content: { Simple: { Subject: { Data: 'Unsupported' }, Body: { Text: { Data: 'body' } } } } },
    'AmazonSimpleEmailServiceV2.ListIdentities',
  );
  expect(unsupported.status).toBe(400);
  expect(apiErrorSchema.parse(await unsupported.json()).message).toContain('Unsupported SES operation');

  const invalidAddresses = await postSes(`${server.url}/v2/email/outbound-emails`, {
    FromEmailAddress: 'sender@example.com',
    Destination: { ToAddresses: 'recipient@example.com' },
    Content: { Simple: { Subject: { Data: 'Invalid' }, Body: { Text: { Data: 'body' } } } },
  });
  expect(invalidAddresses.status).toBe(400);
  expect(apiErrorSchema.parse(await invalidAddresses.json()).message).toBe('Email addresses must be an array of strings');

  const missingContent = await postSes(`${server.url}/v2/email/outbound-emails`, {
    FromEmailAddress: 'sender@example.com',
    Destination: { ToAddresses: ['recipient@example.com'] },
  });
  expect(missingContent.status).toBe(400);
  expect(apiErrorSchema.parse(await missingContent.json()).message).toBe('Content.Simple or Content.Raw is required');

  const unknown = await fetch(`${server.url}/api/not-a-route`);
  expect(unknown.status).toBe(404);
  expect(apiErrorSchema.parse(await unknown.json())).toEqual({ message: 'Not found' });
});

test('local SES API bounds list limits while retaining the store alias', async () => {
  const server = await openServer('limits');
  for (const subject of ['first', 'second']) {
    const response = await postSes(`${server.url}/v2/email/outbound-emails`, {
      FromEmailAddress: 'sender@example.com',
      Destination: { ToAddresses: ['recipient@example.com'] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: subject } } } },
    });
    expect(response.status).toBe(200);
  }

  const invalidLimit = messageListResponseSchema.parse(
    await (await fetch(`${server.url}/api/messages?limit=not-a-number`)).json(),
  );
  expect(invalidLimit.messages).toHaveLength(2);

  const lowerBound = messageListResponseSchema.parse(
    await (await fetch(`${server.url}/api/messages?limit=0`)).json(),
  );
  expect(lowerBound.messages).toHaveLength(1);

  const upperBound = messageListResponseSchema.parse(
    await (await fetch(`${server.url}/api/messages?limit=1001`)).json(),
  );
  expect(upperBound.messages).toHaveLength(2);

  const legacy = messageListResponseSchema.parse(await (await fetch(`${server.url}/store?limit=1`)).json());
  expect(legacy.messages).toHaveLength(1);
});
