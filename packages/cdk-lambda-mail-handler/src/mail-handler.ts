import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { handle, type LambdaEvent } from 'hono/aws-lambda';

import { loadAwsSdk, type AwsSdkModules, type CommandClient } from './aws-sdk.js';
import { createMetadataItem } from './metadata.js';
import {
  toSesApiMailEvent,
  toSesQueryMailEvent,
  type SesApiMailEvent,
  type SesApiProtocol,
  type SesApiRequest,
} from './ses-api.js';

/** @internal */
export interface MailHandlerConfig {
  readonly bucketName: string;
  readonly tableName: string;
  readonly retentionSeconds: number;
}

/** @internal */
export interface MailHandlerResult {
  readonly messageId: string;
  readonly createdAt: string;
  readonly s3Key: string;
}

/** @internal */
export interface MailHandlerDependencies {
  readonly ddb: CommandClient;
  readonly s3: CommandClient;
  readonly sdk: AwsSdkModules;
}

const createDefaultDependencies = (): MailHandlerDependencies => {
  const sdk = loadAwsSdk();
  return {
    ddb: new sdk.DynamoDBClient({}) as CommandClient,
    s3: new sdk.S3Client({}) as CommandClient,
    sdk,
  };
};

type LambdaBindings = { event: LambdaEvent };
const app = new Hono<{ Bindings: LambdaBindings }>();
let cachedDependencies: MailHandlerDependencies | undefined;

// Hono owns the Lambda/API Gateway HTTP adapter. SES v1/v2 protocol parsing
// and response compatibility remain in serveSesApi so they can be tested
// without a deployed API Gateway.
app.all('*', async (context) => {
  cachedDependencies ??= createDefaultDependencies();
  const response = await serveSesApi(context.env.event as SesApiRequest, loadConfig(), cachedDependencies);
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  });
});

/** Lambda entry point for the API Gateway SES-compatible mail API. */
export const handler = handle(app);

/** @internal */
export interface SesApiResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** @internal */
export const processMail = async (
  event: SesApiMailEvent,
  config: MailHandlerConfig,
  dependencies: MailHandlerDependencies = createDefaultDependencies(),
): Promise<MailHandlerResult> => {
  const messageId = randomUUID();
  const createdAt = new Date().toISOString();
  const rawMime = Buffer.from(event.rawMimeBase64, 'base64');
  const date = createdAt.slice(0, 10).split('-');
  const key = `messages/${date[0]}/${date[1]}/${date[2]}/${messageId}.eml`;

  await dependencies.s3.send(new dependencies.sdk.PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: rawMime,
    ContentType: 'message/rfc822',
    Metadata: { messageid: messageId },
  }));

  const expiresAt = Math.floor(Date.now() / 1000) + config.retentionSeconds;
  await dependencies.ddb.send(new dependencies.sdk.PutItemCommand({
    TableName: config.tableName,
    Item: createMetadataItem(event, messageId, createdAt, key, rawMime.byteLength, expiresAt),
  }));

  return { messageId, createdAt, s3Key: key };
};

/** @internal */
export const serveSesApi = async (
  request: SesApiRequest,
  config: MailHandlerConfig,
  dependencies: MailHandlerDependencies = createDefaultDependencies(),
): Promise<SesApiResponse> => {
  const path = request.path ?? request.rawPath ?? '/';
  const protocol: SesApiProtocol = path === '/' ? 'v1' : 'v2';
  const method = request.httpMethod ?? request.requestContext?.http?.method;
  if (method !== 'POST') {
    return sesError(protocol, 405, 'MethodNotAllowed', 'Only POST is supported');
  }
  if (path !== '/' && path !== '/v2/email/outbound-emails') {
    return sesError(protocol, 404, 'NotFound', 'Not found');
  }

  const body = request.body === undefined || request.body === null
    ? ''
    : Buffer.from(request.body, request.isBase64Encoded === true ? 'base64' : 'utf8').toString('utf8');
  let mailEvent: SesApiMailEvent;
  let operation: string | undefined;
  try {
    operation = protocol === 'v1' ? new URLSearchParams(body).get('Action')?.toLowerCase() : undefined;
    mailEvent = protocol === 'v1'
      ? toSesQueryMailEvent(new URLSearchParams(body))
      : toSesApiMailEvent(parseJsonObject(body), header(request, 'x-amz-target'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return sesError(protocol, 400, 'InvalidParameterValue', message);
  }

  try {
    const result = await processMail(mailEvent, config, dependencies);
    return sesSuccess(protocol, result.messageId, operation);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Storage failure';
    return sesError(protocol, 500, 'InternalFailure', message);
  }
};

const loadConfig = (): MailHandlerConfig => {
  const retentionSeconds = Number(process.env.RETENTION_SECONDS);
  if (!Number.isFinite(retentionSeconds) || retentionSeconds <= 0) {
    throw new Error('RETENTION_SECONDS must be greater than zero');
  }
  return {
    bucketName: requiredEnvironment('STORAGE_BUCKET_NAME'),
    tableName: requiredEnvironment('METADATA_TABLE_NAME'),
    retentionSeconds,
  };
};

const parseJsonObject = (body: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

const header = (request: SesApiRequest, name: string): string | undefined => {
  const headers = request.headers ?? {};
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
};

const sesSuccess = (protocol: SesApiProtocol, messageId: string, operation?: string): SesApiResponse => {
  if (protocol === 'v1') {
    const responseName = operation === 'sendrawemail' ? 'SendRawEmail' : 'SendEmail';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
      body: [
        '<?xml version="1.0"?>',
        `<${responseName}Response xmlns="http://ses.amazonaws.com/doc/2010-12-01/">`,
        `<${responseName}Result>`,
        `<MessageId>${escapeXml(messageId)}</MessageId>`,
        `</${responseName}Result>`,
        '<ResponseMetadata/>',
        `</${responseName}Response>`,
      ].join(''),
    };
  }
  return sesJson(200, { MessageId: messageId });
};

const sesError = (
  protocol: SesApiProtocol,
  statusCode: number,
  code: string,
  message: string,
): SesApiResponse => {
  if (protocol === 'v1') {
    return {
      statusCode,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
      body: [
        '<?xml version="1.0"?>',
        '<ErrorResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/">',
        '<Error>',
        '<Type>Sender</Type>',
        `<Code>${escapeXml(code)}</Code>`,
        `<Message>${escapeXml(message)}</Message>`,
        '</Error>',
        '<RequestId>mail-catcher</RequestId>',
        '</ErrorResponse>',
      ].join(''),
    };
  }
  return sesJson(statusCode, { __type: code, message });
};

const sesJson = (statusCode: number, body: unknown): SesApiResponse => ({
  statusCode,
  headers: {
    'Content-Type': 'application/x-amz-json-1.1',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

const escapeXml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
