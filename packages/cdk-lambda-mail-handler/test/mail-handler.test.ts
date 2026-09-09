import { expect, test, vi } from 'vitest';
import { processMail, type MailHandlerConfig, type MailHandlerDependencies } from '../src/mail-handler.js';

const TestClient = vi.fn<(_config: Record<string, unknown>) => void>();

class TestCommand {
  public readonly input: unknown;

  public constructor(input: unknown) {
    this.input = input;
  }
}

type Send = (command: unknown) => Promise<unknown>;

const sdk: MailHandlerDependencies['sdk'] = {
  DynamoDBClient: TestClient,
  GetObjectCommand: TestCommand,
  PutItemCommand: TestCommand,
  PutObjectCommand: TestCommand,
  QueryCommand: TestCommand,
  ScanCommand: TestCommand,
  S3Client: TestClient,
  SendEmailCommand: TestCommand,
  SESv2Client: TestClient,
};

const config = (mode: 'CATCH' | 'RELAY'): MailHandlerConfig => {
  return {
    mode,
    bucketName: 'mail-bucket',
    tableName: 'mail-table',
    retentionSeconds: 604800,
    relay: {
      configurationSetName: 'test-config-set',
    },
  };
};

const dependencies = (overrides: Partial<MailHandlerDependencies> = {}): MailHandlerDependencies => {
  return {
    ddb: { send: vi.fn<Send>().mockResolvedValue({}) },
    s3: { send: vi.fn<Send>().mockResolvedValue({}) },
    ses: { send: vi.fn<Send>().mockResolvedValue({}) },
    sdk,
    ...overrides,
  };
};

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
    attachments: [{
      filename: 'attachment.txt',
      contentType: 'text/plain',
      bucket: 'source-bucket',
      key: 'attachment.txt',
    }],
    metadata: { suite: 'unit' },
  }, config('CATCH'), { ddb, s3, ses: { send: vi.fn<Send>() }, sdk });

  expect(result.mode).toBe('CATCH');
  expect(result).not.toHaveProperty('mailbox');
  expect(result.s3Key).toMatch(/^messages\/\d{4}\/\d{2}\/\d{2}\/.+\.eml$/);
  expect(s3.send).toHaveBeenCalledTimes(2);
  expect(ddb.send).toHaveBeenCalledTimes(1);

  const putInput = (s3.send.mock.calls[1][0] as { input: { Body: Buffer; ContentType: string } }).input;
  const rawMime = putInput.Body.toString('utf8');
  expect(putInput.ContentType).toBe('message/rfc822');
  expect(rawMime.indexOf('Content-Type: multipart/mixed')).toBeLessThan(rawMime.indexOf('\r\n\r\n'));
  expect(rawMime).toContain('multipart/mixed');
  expect(rawMime).toContain('multipart/alternative');
  expect(rawMime).toContain('=?UTF-8?B?44GT44KT44Gr44Gh44Gv?=');
  expect(rawMime).toContain('YXR0YWNobWVudA==');
  expect(rawMime).not.toContain('X-Mailbox:');

  const item = (ddb.send.mock.calls[0][0] as { input: { Item: Record<string, { S?: string }> } }).input.Item;
  expect(item.pk.S).toBe('messages');
  expect(item).not.toHaveProperty('mailbox');
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
