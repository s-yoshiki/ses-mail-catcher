import { describe, expect, test, vi } from 'vitest';

import {
  processMail,
  serveSesApi,
  isSesResponseBinary,
  type MailHandlerConfig,
  type MailHandlerDependencies,
  type SesApiResponse,
} from '../src/mail-handler.js';
import type { SesApiRequest } from '../src/ses-api.js';
import { toSesApiMailEvent, toSesQueryMailEvent } from '../src/ses-api.js';

const TestClient = vi.fn<(_config: Record<string, unknown>) => void>();

class TestCommand {
  public readonly input: unknown;

  public constructor(input: unknown) {
    this.input = input;
  }
}

const sdk: MailHandlerDependencies['sdk'] = {
  DynamoDBClient: TestClient,
  PutItemCommand: TestCommand,
  PutObjectCommand: TestCommand,
  S3Client: TestClient,
};

const config: MailHandlerConfig = {
  bucketName: 'mail-bucket',
  tableName: 'mail-table',
  retentionSeconds: 604800,
};

type Send = (command: unknown) => Promise<unknown>;

const dependencies = (overrides: Partial<MailHandlerDependencies> = {}): MailHandlerDependencies => ({
  ddb: { send: vi.fn<Send>().mockResolvedValue({}) },
  s3: { send: vi.fn<Send>().mockResolvedValue({}) },
  sdk,
  ...overrides,
});

const request = (body: string, overrides: Partial<SesApiRequest> = {}): SesApiRequest => ({
  path: '/v2/email/outbound-emails',
  headers: { 'x-amz-target': 'AmazonSimpleEmailServiceV2.SendEmail' },
  body,
  httpMethod: 'POST',
  ...overrides,
});

const responseBody = (response: SesApiResponse): Record<string, unknown> => {
  return JSON.parse(response.body) as Record<string, unknown>;
};

describe('SES request conversion', () => {
  test('converts SES v2 Simple content and preserves a generated MIME message', () => {
    const event = toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: {
        ToAddresses: ['user@example.com'],
        CcAddresses: ['copy@example.com'],
      },
      Content: {
        Simple: {
          Subject: { Data: 'HTML example' },
          Body: { Text: { Data: 'Plain text' }, Html: { Data: '<p>HTML</p>' } },
        },
      },
      EmailTags: [{ Name: 'campaign', Value: 'spring' }],
    }, 'AmazonSimpleEmailServiceV2.SendEmail');

    const rawMime = Buffer.from(event.rawMimeBase64, 'base64').toString('utf8');
    expect(event).toMatchObject({
      from: 'noreply@example.com',
      to: ['user@example.com'],
      cc: ['copy@example.com'],
      subject: 'HTML example',
      metadata: { campaign: 'spring' },
    });
    expect(rawMime).toContain('multipart/alternative');
    expect(rawMime).toContain('UGxhaW4gdGV4dA==');
    expect(rawMime).toContain('PHA+SFRNTDwvcD4=');
  });

  test('preserves SES v2 Raw MIME and reads omitted addresses from headers', () => {
    const rawMime = 'From: noreply@example.com\r\nTo: user@example.com\r\nSubject: Raw\r\n\r\nbody';
    const event = toSesApiMailEvent({
      Content: { Raw: { Data: Buffer.from(rawMime, 'utf8').toString('base64') } },
    }, 'AmazonSimpleEmailServiceV2.SendEmail');

    expect(event.from).toBe('noreply@example.com');
    expect(event.to).toEqual(['user@example.com']);
    expect(event.subject).toBe('Raw');
    expect(Buffer.from(event.rawMimeBase64, 'base64').toString('utf8')).toBe(rawMime);
  });

  test('converts SES v1 Query SendEmail', () => {
    const params = new URLSearchParams({
      Action: 'SendEmail',
      Source: 'noreply@example.com',
      'Destination.ToAddresses.member.1': 'user@example.com',
      'Message.Subject.Data': 'Query message',
      'Message.Body.Text.Data': 'body',
      'Tags.member.1.Name': 'campaign',
      'Tags.member.1.Value': 'spring',
    });
    const event = toSesQueryMailEvent(params);

    expect(event).toMatchObject({
      from: 'noreply@example.com',
      to: ['user@example.com'],
      subject: 'Query message',
      text: 'body',
      metadata: { campaign: 'spring' },
    });
    expect(Buffer.from(event.rawMimeBase64, 'base64').toString('utf8')).toContain('Subject: Query message');
  });

  test('rejects templates and malformed messages', () => {
    expect(() => toSesApiMailEvent({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: { Template: { TemplateName: 'example' } },
    }, 'AmazonSimpleEmailServiceV2.SendEmail')).toThrow('Content.Template is not supported');

    expect(() => toSesQueryMailEvent(new URLSearchParams({ Action: 'ListIdentities' })))
      .toThrow('Action must be SendEmail or SendRawEmail');
  });
});

describe('mail API', () => {
  test('keeps SES v2 JSON responses plain for the Hono Lambda adapter', () => {
    expect(isSesResponseBinary('application/x-amz-json-1.1')).toBe(false);
    expect(isSesResponseBinary('application/json')).toBe(false);
    expect(isSesResponseBinary('application/octet-stream')).toBe(true);
  });

  test('stores a SES v2 request and returns a JSON MessageId', async () => {
    const s3 = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };
    const response = await serveSesApi(request(JSON.stringify({
      FromEmailAddress: 'noreply@example.com',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: { Simple: { Subject: { Data: 'Test' }, Body: { Text: { Data: 'body' } } } },
    })), config, dependencies({ s3, ddb }));

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/x-amz-json-1.1');
    expect(responseBody(response).MessageId).toEqual(expect.any(String));
    expect(s3.send).toHaveBeenCalledTimes(1);
    expect(ddb.send).toHaveBeenCalledTimes(1);
  });

  test('stores a SES v1 Query request and returns an XML MessageId', async () => {
    const s3 = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };
    const params = new URLSearchParams({
      Action: 'SendRawEmail',
      Source: 'noreply@example.com',
      'Destinations.member.1': 'user@example.com',
      'RawMessage.Data': Buffer.from(
        'From: noreply@example.com\r\nTo: user@example.com\r\nSubject: Raw\r\n\r\nbody',
      ).toString('base64'),
    });
    const response = await serveSesApi(
      { path: '/', httpMethod: 'POST', body: params.toString() },
      config,
      dependencies({ s3, ddb }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/xml; charset=utf-8');
    expect(response.body).toContain('<SendRawEmailResponse');
    expect(response.body).toContain('<MessageId>');
  });

  test('returns protocol-specific errors without writing storage', async () => {
    const deps = dependencies();
    const response = await serveSesApi(request('{'), config, deps);
    expect(response.statusCode).toBe(400);
    expect(responseBody(response)).toMatchObject({ __type: 'InvalidParameterValue' });
    expect(deps.s3.send).not.toHaveBeenCalled();

    const v1 = await serveSesApi({ path: '/', httpMethod: 'GET', body: '' }, config, deps);
    expect(v1.statusCode).toBe(405);
    expect(v1.body).toContain('<ErrorResponse');
  });

  test('stores the original raw MIME bytes', async () => {
    const s3 = { send: vi.fn<Send>().mockResolvedValue({}) };
    const ddb = { send: vi.fn<Send>().mockResolvedValue({}) };
    const rawMime = 'From: noreply@example.com\r\nTo: user@example.com\r\nSubject: Stored\r\n\r\nbody';
    const result = await processMail({
      from: 'noreply@example.com',
      to: ['user@example.com'],
      subject: 'Stored',
      rawMimeBase64: Buffer.from(rawMime, 'utf8').toString('base64'),
    }, config, { s3, ddb, sdk });

    expect(result.s3Key).toMatch(/^messages\/\d{4}\/\d{2}\/\d{2}\/.+\.eml$/);
    const command = s3.send.mock.calls[0]?.[0];
    expect(command).toBeDefined();
    const input = (command as { input: { Body: Buffer } }).input;
    expect(input.Body.toString('utf8')).toBe(rawMime);
  });
});
