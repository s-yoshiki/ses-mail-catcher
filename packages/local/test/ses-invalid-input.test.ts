import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apiErrorSchema, messageListResponseSchema } from 'ses-mail-catcher-api-contract';
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

const createServer = async (prefix: string): Promise<{ url: string }> => {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  const server = await startServer({ dbPath: join(directory, 'mailbox.sqlite3'), port: 0 });
  servers.push(server);
  return server;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it('rejects templates because only Simple and Raw content are supported', async () => {
  const server = await createServer('ses-mail-catcher-template-');
  const response = await postSes(server.url, {
    FromEmailAddress: 'sender@example.com',
    Destination: { ToAddresses: ['recipient@example.com'] },
    Content: { Template: { TemplateName: 'welcome' } },
  });

  expect(response.status).toBe(400);
  expect(response.headers.get('content-type')).toBe('application/x-amz-json-1.1; charset=utf-8');
  const error = await response.json() as { __type: string; message: string };
  expect(error).toEqual({
    __type: 'InvalidParameterValue',
    message: 'Content.Simple or Content.Raw is required',
  });
  expect(apiErrorSchema.parse(error)).toEqual({ message: error.message });
  expect(messageListResponseSchema.parse(await (await fetch(`${server.url}/api/messages`)).json())).toEqual({
    messages: [],
    mailboxes: [],
  });
});

it('returns SES-shaped errors for malformed JSON and unsupported operations', async () => {
  const server = await createServer('ses-mail-catcher-invalid-');
  const malformed = await fetch(`${server.url}/v2/email/outbound-emails`, {
    method: 'POST',
    headers: { 'x-amz-target': 'AmazonSimpleEmailServiceV2.SendEmail' },
    body: '{not-json',
  });
  expect(malformed.status).toBe(400);
  const malformedError = await malformed.json() as { __type: string; message: string };
  expect(malformedError).toMatchObject({
    __type: 'InvalidParameterValue',
  });
  expect(malformedError.message).toContain('JSON');

  const unsupported = await postSes(
    server.url,
    {},
    'AmazonSimpleEmailServiceV2.CreateEmailTemplate',
  );
  expect(unsupported.status).toBe(400);
  expect(await unsupported.json()).toEqual({
    __type: 'InvalidParameterValue',
    message: 'Unsupported SES operation: createemailtemplate',
  });

  const invalidAttachment = await postSes(server.url, {
    Content: {
      Simple: {
        Subject: { Data: 'Invalid attachment' },
        Body: { Text: { Data: 'body' } },
        Attachments: [{ FileName: 'missing-content.txt' }],
      },
    },
  });
  expect(invalidAttachment.status).toBe(400);
  expect(await invalidAttachment.json()).toEqual({
    __type: 'InvalidParameterValue',
    message: 'Attachments require RawContent and FileName',
  });
});
