import { expect, test, vi } from 'vitest';

import {
  serveSesApi,
  type MailHandlerConfig,
  type MailHandlerDependencies,
  type SesApiResponse,
} from '../src/mail-handler.js';
import type { SesApiRequest } from '../src/ses-api.js';
import { toSesApiMailEvent } from '../src/ses-api.js';

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

const config = (mode: 'CATCH' | 'RELAY'): MailHandlerConfig => ({
  mode,
  bucketName: 'mail-bucket',
  tableName: 'mail-table',
  retentionSeconds: 604800,
  relay: { configurationSetName: 'test-config-set' },
});

const dependencies = (overrides: Partial<MailHandlerDependencies> = {}): MailHandlerDependencies => ({
  ddb: { send: vi.fn<Send>().mockResolvedValue({}) },
  s3: { send: vi.fn<Send>().mockResolvedValue({}) },
  ses: { send: vi.fn<Send>().mockResolvedValue({}) },
  sdk,
  ...overrides,
});

const request = (input: unknown, overrides: Partial<SesApiRequest> = {}): SesApiRequest => ({
  rawPath: '/v2/email/outbound-emails',
  headers: { 'x-amz-target': 'AmazonSimpleEmailServiceV2.SendEmail' },
  body: typeof input === 'string' ? input : JSON.stringify(input),
  requestContext: { http: { method: 'POST' } },
  ...overrides,
});

const responseBody = (response: SesApiResponse): Record<string, unknown> => {
  return JSON.parse(response.body) as Record<string, unknown>;
};

test('SES v2 converts Simple content with alternative parts and attachments', () => {
    const event = toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: {
        ToAddresses: ['user@example.com'],
        CcAddresses: ['copy@example.com'],
      },
      ReplyToAddresses: ['reply@example.com'],
      EmailTags: [{ Name: 'campaign', Value: 'spring' }],
      Content: {
        Simple: {
          Subject: { Data: 'HTML example' },
          Body: {
            Text: { Data: 'Plain text' },
            Html: { Data: '<p>HTML</p>' },
          },
          Attachments: [{
            FileName: 'hello.txt',
            RawContent: Buffer.from('attachment').toString('base64'),
            ContentType: 'text/plain',
            ContentDisposition: 'inline',
            ContentDescription: 'A greeting',
          }],
        },
      },
    }, 'SESv2.SendEmail');

    const rawMime = Buffer.from(event.rawMimeBase64, 'base64').toString('utf8');
    expect(event).toMatchObject({
      from: 'noreply@example.com',
      to: ['user@example.com'],
      cc: ['copy@example.com'],
      replyTo: ['reply@example.com'],
      subject: 'HTML example',
      text: 'Plain text',
      html: '<p>HTML</p>',
      metadata: { campaign: 'spring' },
    });
    expect(rawMime).toContain('multipart/mixed');
    expect(rawMime).toContain('multipart/alternative');
    expect(rawMime).toContain('UGxhaW4gdGV4dA==');
    expect(rawMime).toContain('PHA+SFRNTDwvcD4=');
    expect(rawMime).toContain('YXR0YWNobWVudA==');
    expect(rawMime).toContain('Content-Disposition: inline');
    expect(rawMime).toContain('Content-Description: A greeting');
});

test('SES v2 preserves a Raw message and reads address headers when fields are omitted', () => {
    const rawMime = 'From: noreply@example.com\r\nTo: user@example.com\r\nCc: copy@example.com\r\nSubject: Raw\r\n\r\nbody';
    const event = toSesApiMailEvent({
      Content: { Raw: { Data: Buffer.from(rawMime, 'utf8').toString('base64') } },
    }, 'SESv2.SendRawEmail');

    expect(event.from).toBe('noreply@example.com');
    expect(event.to).toEqual(['user@example.com']);
    expect(event.cc).toEqual(['copy@example.com']);
    expect(event.subject).toBe('Raw');
    expect(Buffer.from(event.rawMimeBase64, 'base64').toString('utf8')).toBe(rawMime);
});

test('SES v2 rejects unsupported templates and malformed input', () => {
    expect(() => toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: { Template: { TemplateName: 'example', TemplateData: '{}' } },
    }, 'SESv2.SendEmail')).toThrow('Content.Template is not supported');

    expect(() => toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
    }, 'SESv2.SendEmail')).toThrow('Subject must be a non-empty string without CR or LF');

    expect(() => toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Missing body' },
        },
      },
    }, 'SESv2.SendEmail')).toThrow('Content.Simple.Body.Text or Content.Simple.Body.Html is required');

    expect(() => toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Bad attachment' },
          Body: { Text: { Data: 'body' } },
          Attachments: [{ FileName: 'missing-content' }],
        },
      },
    }, 'SESv2.SendEmail')).toThrow('attachments require RawContent and FileName');

    expect(() => toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: { Simple: { Subject: { Data: 'Unsupported' }, Body: { Text: { Data: 'body' } } } },
    }, 'SESv2.ListIdentities')).toThrow('Unsupported SES operation');
});

test('SES Function URL accepts a base64-encoded Simple request and stores its attachment', async () => {
    const s3 = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ses = { send: vi.fn<Send>().mockResolvedValue({}) };
    const deps = dependencies({ s3, ddb, ses });
    const input = {
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Function URL Simple' },
          Body: { Text: { Data: 'body' } },
          Attachments: [{
            FileName: 'hello.txt',
            RawContent: Buffer.from('attachment').toString('base64'),
            ContentType: 'text/plain',
          }],
        },
      },
    };
    const response = await serveSesApi(request(input, {
      body: Buffer.from(JSON.stringify(input), 'utf8').toString('base64'),
      isBase64Encoded: true,
    }), config('CATCH'), deps);

    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'Content-Type': 'application/x-amz-json-1.1',
      'Cache-Control': 'no-store',
    });
    expect(responseBody(response).MessageId).toEqual(expect.any(String));
    expect(ses.send).not.toHaveBeenCalled();
    expect(s3.send).toHaveBeenCalledTimes(1);
    expect(ddb.send).toHaveBeenCalledTimes(1);

    const putInput = s3.send.mock.calls[0]?.[0] as { input: { Body: Buffer } };
    expect(putInput.input.Body.toString('utf8')).toContain('YXR0YWNobWVudA==');
});

test('SES Function URL accepts Raw content and relays the original MIME without storage', async () => {
    const s3 = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ses = { send: vi.fn<Send>().mockResolvedValue({}) };
    const deps = dependencies({ s3, ddb, ses });
    const rawMime = 'From: noreply@example.com\r\nTo: user@example.com\r\nSubject: Function URL Raw\r\n\r\nbody';
    const response = await serveSesApi(request({
      Content: { Raw: { Data: Buffer.from(rawMime, 'utf8').toString('base64') } },
    }, { headers: { 'x-amz-target': 'AmazonSimpleEmailServiceV2.SendRawEmail' } }), config('RELAY'), deps);

    expect(response.statusCode).toBe(200);
    expect(responseBody(response).MessageId).toEqual(expect.any(String));
    expect(s3.send).not.toHaveBeenCalled();
    expect(ddb.send).not.toHaveBeenCalled();
    expect(ses.send).toHaveBeenCalledTimes(1);
    const relayInput = ses.send.mock.calls[0]?.[0] as {
      input: { Content: { Raw: { Data: Buffer } } };
    };
    expect(relayInput.input.Content.Raw.Data.toString('utf8')).toBe(rawMime);
});

test('SES Function URL returns stable status and error shapes for invalid requests', async () => {
    const s3 = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ses = { send: vi.fn<Send>().mockResolvedValue({}) };
    const deps = dependencies({ s3, ddb, ses });
    const method = await serveSesApi(request({}, { requestContext: { http: { method: 'GET' } } }), config('CATCH'), deps);
    expect(method.statusCode).toBe(405);
    expect(responseBody(method)).toEqual({ __type: 'MethodNotAllowed', message: 'Only POST is supported' });

    const path = await serveSesApi(request({}, { rawPath: '/not-supported' }), config('CATCH'), deps);
    expect(path.statusCode).toBe(404);
    expect(responseBody(path)).toEqual({ __type: 'NotFound', message: 'Not found' });

    const malformed = await serveSesApi(request('{'), config('CATCH'), deps);
    expect(malformed.statusCode).toBe(400);
    expect(responseBody(malformed)).toEqual(expect.objectContaining({
      __type: 'InvalidParameterValue',
      message: expect.any(String),
    }));

    const nonObject = await serveSesApi(request('[]'), config('CATCH'), deps);
    expect(nonObject.statusCode).toBe(400);
    expect(responseBody(nonObject)).toEqual({
      __type: 'InvalidParameterValue',
      message: 'request body must be a JSON object',
    });

    const template = await serveSesApi(request({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: { Template: { TemplateName: 'example', TemplateData: '{}' } },
    }), config('CATCH'), deps);
    expect(template.statusCode).toBe(400);
    expect(responseBody(template).message).toContain('Content.Template is not supported');

    const invalidRecipient = await serveSesApi(request({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: 'user@example.com' },
      Content: { Simple: { Subject: { Data: 'Invalid' }, Body: { Text: { Data: 'body' } } } },
    }), config('CATCH'), deps);
    expect(invalidRecipient.statusCode).toBe(400);
    expect(responseBody(invalidRecipient).message).toBe('Email addresses must be an array of strings');
    expect(s3.send).not.toHaveBeenCalled();
    expect(ddb.send).not.toHaveBeenCalled();
    expect(ses.send).not.toHaveBeenCalled();
});
