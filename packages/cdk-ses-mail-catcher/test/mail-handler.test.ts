import { expect, test, vi } from 'vitest';
import { processMail, type MailHandlerConfig, type MailHandlerDependencies } from '../src/mail-handler';

const TestClient = vi.fn<(_config: Record<string, unknown>) => void>();

const TestCommand = vi.fn<(input: unknown) => void>(function (this: { input: unknown }, input: unknown): void {
  this.input = input;
});

type Send = (command: unknown) => Promise<unknown>;

const sdk: MailHandlerDependencies['sdk'] = {
  DynamoDBClient: TestClient,
  GetObjectCommand: TestCommand,
  PutItemCommand: TestCommand,
  PutObjectCommand: TestCommand,
  S3Client: TestClient,
  SendEmailCommand: TestCommand,
  SESv2Client: TestClient,
};

function config(mode: 'CATCH' | 'RELAY'): MailHandlerConfig {
  return {
    mode,
    bucketName: 'mail-bucket',
    tableName: 'mail-table',
    retentionSeconds: 604800,
    relay: {
      configurationSetName: 'test-config-set',
    },
  };
}

function dependencies(overrides: Partial<MailHandlerDependencies> = {}): MailHandlerDependencies {
  return {
    ddb: { send: vi.fn<Send>().mockResolvedValue({}) },
    s3: { send: vi.fn<Send>().mockResolvedValue({}) },
    ses: { send: vi.fn<Send>().mockResolvedValue({}) },
    sdk,
    ...overrides,
  };
}

test('validates, creates MIME, and stores a message with an S3 attachment', async () => {
  const s3 = {
    send: vi.fn<Send>(async (command: unknown) => {
      const input = (command as { input: { Key?: string } }).input;
      if (input.Key === 'attachment.txt') {
        return { Body: { transformToByteArray: async () => Buffer.from('attachment') } };
      }
      return {};
    }),
  };
  const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };

  const result = await processMail({
    from: 'noreply@example.com',
    to: ['user@example.com'],
    cc: ['copy@example.com'],
    subject: 'こんにちは',
    text: 'Plain text',
    html: '<p>HTML</p>',
    mailbox: 'development',
    attachments: [{
      filename: 'attachment.txt',
      contentType: 'text/plain',
      bucket: 'source-bucket',
      key: 'attachment.txt',
    }],
    metadata: { suite: 'unit' },
  }, config('CATCH'), { ddb, s3, ses: { send: vi.fn<Send>() }, sdk });

  expect(result.mode).toBe('CATCH');
  expect(result.mailbox).toBe('development');
  expect(result.s3Key).toMatch(/^mail\/development\/\d{4}\/\d{2}\/\d{2}\/.+\.eml$/);
  expect(s3.send).toHaveBeenCalledTimes(2);
  expect(ddb.send).toHaveBeenCalledTimes(1);

  const putInput = (s3.send.mock.calls[1][0] as { input: { Body: Buffer; ContentType: string } }).input;
  const rawMime = putInput.Body.toString('utf8');
  expect(putInput.ContentType).toBe('message/rfc822');
  expect(rawMime).toContain('multipart/mixed');
  expect(rawMime).toContain('multipart/alternative');
  expect(rawMime).toContain('=?UTF-8?B?44GT44KT44Gr44Gh44Gv?=');
  expect(rawMime).toContain('YXR0YWNobWVudA==');

  const item = (ddb.send.mock.calls[0][0] as { input: { Item: Record<string, { S?: string }> } }).input.Item;
  expect(item.mailbox.S).toBe('development');
  expect(item.subject.S).toBe('こんにちは');
  expect(item.metadata).toBeDefined();
});

test('relays the same raw MIME through SES without writing storage', async () => {
  const ddb = { send: vi.fn<Send>() };
  const s3 = { send: vi.fn<Send>() };
  const ses = { send: vi.fn<Send>().mockResolvedValue({}) };

  const result = await processMail({
    from: 'noreply@example.com',
    to: ['user@example.com'],
    subject: 'Relay test',
    text: 'Hello',
  }, config('RELAY'), { ddb, s3, ses, sdk });

  expect(result.mode).toBe('RELAY');
  expect(ddb.send).not.toHaveBeenCalled();
  expect(s3.send).not.toHaveBeenCalled();
  expect(ses.send).toHaveBeenCalledTimes(1);
  const input = (ses.send.mock.calls[0][0] as { input: { Content: { Raw: { Data: Buffer } } } }).input;
  expect(input.Content.Raw.Data.toString('utf8')).toContain('Subject: Relay test');
});

test('rejects invalid recipient input before calling AWS services', async () => {
  const deps = dependencies();

  await expect(processMail({
    from: 'noreply@example.com',
    to: [],
    subject: 'Invalid',
  }, config('CATCH'), deps)).rejects.toThrow('to must be a non-empty array');
  expect(deps.s3.send).not.toHaveBeenCalled();
  expect(deps.ddb.send).not.toHaveBeenCalled();
  expect(deps.ses.send).not.toHaveBeenCalled();
});
