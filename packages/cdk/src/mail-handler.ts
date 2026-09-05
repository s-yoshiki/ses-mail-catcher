import { randomUUID } from 'node:crypto';

import { loadAwsSdk, type AwsSdkModules, type CommandClient } from './aws-sdk.js';
import { createMetadataItem } from './metadata.js';
import { createMimeMessage } from './mime.js';
import { validateEvent } from './mail-validation.js';

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

function createDefaultDependencies(): MailHandlerDependencies {
  const sdk = loadAwsSdk();
  return {
    ddb: new sdk.DynamoDBClient({}) as CommandClient,
    s3: new sdk.S3Client({}) as CommandClient,
    ses: new sdk.SESv2Client({}) as CommandClient,
    sdk,
  };
}

/** Lambda entry point for the generated CDK function. */
export async function handler(event: unknown): Promise<MailHandlerResult> {
  return processMail(event, loadConfig());
}

/** @internal */
export async function processMail(
  event: unknown,
  config: MailHandlerConfig,
  dependencies: MailHandlerDependencies = createDefaultDependencies(),
): Promise<MailHandlerResult> {
  validateEvent(event);

  const messageId = randomUUID();
  const createdAt = new Date().toISOString();
  const mailbox = event.mailbox ?? 'default';
  const rawMime = await createMimeMessage(
    event,
    messageId,
    createdAt,
    mailbox,
    (attachment) => readAttachment(dependencies.s3, dependencies.sdk, attachment.bucket, attachment.key),
  );

  if (config.mode === 'RELAY') {
    const relayParameters = {
      Content: { Raw: { Data: Buffer.from(rawMime, 'utf8') } },
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
    Body: Buffer.from(rawMime, 'utf8'),
    ContentType: 'message/rfc822',
    Metadata: { messageid: messageId, mailbox },
  }));

  const expiresAt = Math.floor(Date.now() / 1000) + config.retentionSeconds;
  await dependencies.ddb.send(new dependencies.sdk.PutItemCommand({
    TableName: config.tableName,
    Item: createMetadataItem(event, messageId, createdAt, mailbox, key, Buffer.byteLength(rawMime, 'utf8'), expiresAt),
  }));

  return { messageId, mailbox, mode: 'CATCH', createdAt, s3Key: key };
}

function loadConfig(): MailHandlerConfig {
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
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function readAttachment(client: CommandClient, sdk: AwsSdkModules, bucket: string, key: string): Promise<Uint8Array> {
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
}
