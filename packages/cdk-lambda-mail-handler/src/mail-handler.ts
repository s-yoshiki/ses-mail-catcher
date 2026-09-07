import { randomUUID } from 'node:crypto';

import { loadAwsSdk, type AwsSdkModules, type CommandClient } from './aws-sdk.js';
import { createMetadataItem } from './metadata.js';
import { createMimeMessage } from './mime.js';
import { validateEvent } from './mail-validation.js';
import { toSesApiMailEvent, type SesApiMailEvent, type SesApiRequest } from './ses-api.js';

type MailHandlerMode = 'CATCH' | 'RELAY';

/** @internal */
export interface MailHandlerConfig {
  readonly mode: MailHandlerMode;
  readonly bucketName: string;
  readonly tableName: string;
  readonly retentionSeconds: number;
  readonly relay?: {
    readonly configurationSetName?: string;
    readonly fromEmailAddressIdentityArn?: string;
    readonly feedbackForwardingEmailAddress?: string;
  };
}

/** @internal */
export interface MailHandlerResult {
  readonly messageId: string;
  readonly mailbox: string;
  readonly mode: MailHandlerMode;
  readonly createdAt: string;
  readonly s3Key?: string;
}

/** @internal */
export interface MailHandlerDependencies {
  readonly ddb: CommandClient;
  readonly s3: CommandClient;
  readonly ses: CommandClient;
  readonly sdk: AwsSdkModules;
}

const createDefaultDependencies = (): MailHandlerDependencies => {
  const sdk = loadAwsSdk();
  return {
    ddb: new sdk.DynamoDBClient({}) as CommandClient,
    s3: new sdk.S3Client({}) as CommandClient,
    ses: new sdk.SESv2Client({}) as CommandClient,
    sdk,
  };
};

/** Lambda entry point for the generated CDK function. */
export const handler = async (event: unknown): Promise<MailHandlerResult | SesApiResponse> => {
  if (isSesApiRequest(event)) {
    return serveSesApi(event, loadConfig());
  }
  return processMail(event, loadConfig());
};

/** @internal */
export const processMail = async (
  event: unknown,
  config: MailHandlerConfig,
  dependencies: MailHandlerDependencies = createDefaultDependencies(),
): Promise<MailHandlerResult> => {
  validateEvent(event);
  const mailEvent = event as SesApiMailEvent;

  const messageId = randomUUID();
  const createdAt = new Date().toISOString();
  const mailbox = event.mailbox ?? 'default';
  const rawMime = mailEvent.rawMimeBase64 === undefined
    ? Buffer.from(await createMimeMessage(
      event,
      messageId,
      createdAt,
      mailbox,
      (attachment) => readAttachment(dependencies.s3, dependencies.sdk, attachment.bucket, attachment.key),
    ), 'utf8')
    : Buffer.from(mailEvent.rawMimeBase64, 'base64');

  if (config.mode === 'RELAY') {
    const relayParameters = {
      Content: { Raw: { Data: rawMime } },
      ...(config.relay?.configurationSetName ? { ConfigurationSetName: config.relay.configurationSetName } : {}),
      ...(config.relay?.fromEmailAddressIdentityArn ? { FromEmailAddressIdentityArn: config.relay.fromEmailAddressIdentityArn } : {}),
      ...(config.relay?.feedbackForwardingEmailAddress ? { FeedbackForwardingEmailAddress: config.relay.feedbackForwardingEmailAddress } : {}),
    };
    await dependencies.ses.send(new dependencies.sdk.SendEmailCommand(relayParameters));
    return { messageId, mailbox, mode: 'RELAY', createdAt };
  }

  const date = createdAt.slice(0, 10).split('-');
  const key = `mail/${mailbox}/${date[0]}/${date[1]}/${date[2]}/${messageId}.eml`;
  await dependencies.s3.send(new dependencies.sdk.PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: rawMime,
    ContentType: 'message/rfc822',
    Metadata: { messageid: messageId, mailbox },
  }));

  const expiresAt = Math.floor(Date.now() / 1000) + config.retentionSeconds;
  await dependencies.ddb.send(new dependencies.sdk.PutItemCommand({
    TableName: config.tableName,
    Item: createMetadataItem(event, messageId, createdAt, mailbox, key, rawMime.byteLength, expiresAt),
  }));

  return { messageId, mailbox, mode: 'CATCH', createdAt, s3Key: key };
};

interface SesApiResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

const serveSesApi = async (request: SesApiRequest, config: MailHandlerConfig): Promise<SesApiResponse> => {
  if (request.requestContext?.http?.method !== 'POST') {
    return sesError(405, 'MethodNotAllowed', 'Only POST is supported');
  }
  if (request.rawPath !== '/' && request.rawPath !== '/v2/email/outbound-emails') {
    return sesError(404, 'NotFound', 'Not found');
  }

  try {
    const body = request.body === undefined
      ? ''
      : Buffer.from(request.body, request.isBase64Encoded === true ? 'base64' : 'utf8').toString('utf8');
    const parsed: unknown = JSON.parse(body);
    const input = asRecord(parsed);
    if (input === undefined) {
      throw new Error('request body must be a JSON object');
    }
    const mailEvent = toSesApiMailEvent(input, header(request, 'x-amz-target'));
    const result = await processMail(mailEvent, config);
    return sesJson(200, { MessageId: result.messageId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return sesError(400, 'InvalidParameterValue', message);
  }
};

const isSesApiRequest = (event: unknown): event is SesApiRequest => {
  const value = asRecord(event);
  return value?.requestContext !== undefined && ('rawPath' in value || 'body' in value);
};

const header = (request: SesApiRequest, name: string): string | undefined => {
  const headers = request.headers ?? {};
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
};

const sesError = (statusCode: number, type: string, message: string): SesApiResponse => {
  return sesJson(statusCode, { __type: type, message });
};

const sesJson = (statusCode: number, body: unknown): SesApiResponse => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
};

const loadConfig = (): MailHandlerConfig => {
  const mode = process.env.MAIL_MODE;
  if (mode !== 'CATCH' && mode !== 'RELAY') {
    throw new Error('MAIL_MODE must be CATCH or RELAY');
  }

  const retentionSeconds = Number(process.env.RETENTION_SECONDS);
  if (!Number.isFinite(retentionSeconds) || retentionSeconds <= 0) {
    throw new Error('RETENTION_SECONDS must be greater than zero');
  }

  return {
    mode,
    bucketName: requiredEnvironment('STORAGE_BUCKET_NAME'),
    tableName: requiredEnvironment('METADATA_TABLE_NAME'),
    retentionSeconds,
    relay: {
      configurationSetName: process.env.SES_CONFIGURATION_SET_NAME,
      fromEmailAddressIdentityArn: process.env.SES_FROM_EMAIL_ADDRESS_IDENTITY_ARN,
      feedbackForwardingEmailAddress: process.env.SES_FEEDBACK_FORWARDING_EMAIL_ADDRESS,
    },
  };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
};

const readAttachment = async (client: CommandClient, sdk: AwsSdkModules, bucket: string, key: string): Promise<Uint8Array> => {
  const response = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = (response as { Body?: unknown }).Body;
  if (!body) throw new Error('attachment S3 object has no body');
  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (transformable.transformToByteArray) return transformable.transformToByteArray();

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};
