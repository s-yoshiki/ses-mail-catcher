import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { resolveDbPath } from './db-path.js';
import { createSimpleMime, parseMimeHeaders, toApiMessage } from './mime.js';
import { resolveHost, resolvePort } from './options.js';
import { SqliteStore } from './sqlite-store.js';
import type { StoredMessage } from './types.js';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export interface LocalServerOptions {
  host?: string;
  port?: number;
  dbPath?: string;
}

export interface RunningLocalServer {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly url: string;
  readonly store: SqliteStore;
  readonly server: Server;
  close(): Promise<void>;
}

export async function startServer(options: LocalServerOptions = {}): Promise<RunningLocalServer> {
  const host = options.host ?? resolveHost();
  const requestedPort = options.port ?? resolvePort();
  const dbPath = options.dbPath ?? resolveDbPath();
  const store = await SqliteStore.open(dbPath);
  const server = createServer((request, response) => {
    void handleRequest(request, response, store);
  });

  try {
    await listen(server, host, requestedPort);
  } catch (error) {
    store.close();
    throw error;
  }

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : requestedPort;
  return {
    host,
    port,
    dbPath,
    url: `http://${host}:${port}`,
    store,
    server,
    close: async () => {
      await closeServer(server);
      store.close();
    },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: SqliteStore,
): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (request.method === 'GET' && url.pathname === '/health-check') {
      writeJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/store') {
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '100', 10);
      writeJson(response, 200, { messages: store.list(Number.isNaN(limit) ? 100 : limit) });
      return;
    }

    if (request.method === 'GET' && pathParts[0] === 'store' && pathParts.length === 2) {
      const message = store.get(decodeURIComponent(pathParts[1]));
      if (!message) {
        writeJson(response, 404, { message: 'Message not found' });
        return;
      }
      writeJson(response, 200, toApiMessage(message));
      return;
    }

    if (request.method === 'GET' && pathParts[0] === 'store' && pathParts[2] === 'raw') {
      const message = store.get(decodeURIComponent(pathParts[1]));
      if (!message) {
        writeJson(response, 404, { message: 'Message not found' });
        return;
      }
      response.writeHead(200, {
        'Content-Length': message.rawMime.byteLength,
        'Content-Type': 'message/rfc822',
      });
      response.end(Buffer.from(message.rawMime));
      return;
    }

    if (request.method === 'POST' && isSesSendPath(url.pathname)) {
      const body = await readJson(request);
      const message = saveSesMessage(body, request.headers['x-amz-target'], store);
      writeJson(response, 200, { MessageId: message.id });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/') {
      writeJson(response, 200, {
        name: 'ses-mail-catcher-local',
        endpoints: ['POST /v2/email/outbound-emails', 'GET /store', 'GET /store/:id', 'GET /health-check'],
      });
      return;
    }

    writeJson(response, 404, { message: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    writeJson(response, 400, {
      __type: 'InvalidParameterValue',
      message,
    });
  }
}

function saveSesMessage(
  input: Record<string, unknown>,
  targetHeader: string | string[] | undefined,
  store: SqliteStore,
): StoredMessage {
  const target = Array.isArray(targetHeader) ? targetHeader[0] : targetHeader;
  const operation = target?.split('.').at(-1)?.toLowerCase();
  const content = asRecord(input.Content);
  const raw = asRecord(content?.Raw);
  const rawData = asString(raw?.Data) ?? asString(asRecord(input.RawMessage)?.Data);
  const destination = asRecord(input.Destination);
  const toAddresses = stringArray(destination?.ToAddresses ?? input.ToAddresses);
  const ccAddresses = stringArray(destination?.CcAddresses ?? input.CcAddresses);
  const bccAddresses = stringArray(destination?.BccAddresses ?? input.BccAddresses);
  const replyToAddresses = stringArray(input.ReplyToAddresses);

  if (operation !== undefined && operation !== 'sendemail' && operation !== 'sendrawemail') {
    throw new Error(`Unsupported SES operation: ${operation}`);
  }

  const rawMime = rawData
    ? Buffer.from(rawData, 'base64')
    : createSimpleEmail(input, content, toAddresses, ccAddresses);
  const parsed = parseMimeHeaders(rawMime);
  const message: StoredMessage = {
    id: randomUUID(),
    ...(asString(input.FromEmailAddress) ?? parsed.fromAddress
      ? { fromAddress: asString(input.FromEmailAddress) ?? parsed.fromAddress }
      : {}),
    toAddresses: toAddresses.length > 0 ? toAddresses : parsed.toAddresses,
    ccAddresses: ccAddresses.length > 0 ? ccAddresses : parsed.ccAddresses,
    bccAddresses: bccAddresses.length > 0 ? bccAddresses : parsed.bccAddresses,
    replyToAddresses,
    subject: parsed.subject,
    rawMime,
    receivedAt: new Date().toISOString(),
    mailbox: readMailbox(input),
  };

  return store.save(message);
}

function createSimpleEmail(
  input: Record<string, unknown>,
  content: Record<string, unknown> | undefined,
  toAddresses: string[],
  ccAddresses: string[],
): Uint8Array {
  const simple = asRecord(content?.Simple);
  if (!simple) {
    throw new Error('Content.Simple or Content.Raw is required');
  }
  const subject = asContentValue(simple.Subject);
  if (!subject) {
    throw new Error('Content.Simple.Subject is required');
  }
  const bodyRecord = asRecord(simple.Body);
  const text = asContentValue(bodyRecord?.Text);
  const html = asContentValue(bodyRecord?.Html);
  const attachments = Array.isArray(simple.Attachments)
    ? simple.Attachments.map((attachment) => asAttachment(attachment))
    : undefined;

  return createSimpleMime(asString(input.FromEmailAddress), toAddresses, ccAddresses, {
    Subject: subject,
    ...(text || html ? { Body: { ...(text ? { Text: text } : {}), ...(html ? { Html: html } : {}) } } : {}),
    ...(attachments && attachments.length > 0 ? { Attachments: attachments } : {}),
  });
}

function readMailbox(input: Record<string, unknown>): string {
  const tags = Array.isArray(input.EmailTags) ? input.EmailTags : Array.isArray(input.Tags) ? input.Tags : [];
  const mailboxTag = tags.find((tag): tag is { Name: string; Value: string } => {
    const record = asRecord(tag);
    return asString(record?.Name)?.toLowerCase() === 'mailbox' && typeof record?.Value === 'string';
  });
  return mailboxTag?.Value ?? 'default';
}

function asAttachment(value: unknown): {
  RawContent: string;
  FileName: string;
  ContentDisposition?: string;
  ContentDescription?: string;
  ContentTransferEncoding?: string;
  ContentType?: string;
} {
  const record = asRecord(value);
  const rawContent = asString(record?.RawContent);
  const fileName = asString(record?.FileName);
  if (!rawContent || !fileName) {
    throw new Error('Attachments require RawContent and FileName');
  }
  return {
    RawContent: rawContent,
    FileName: fileName,
    ...(asString(record?.ContentDisposition) ? { ContentDisposition: asString(record?.ContentDisposition) } : {}),
    ...(asString(record?.ContentDescription) ? { ContentDescription: asString(record?.ContentDescription) } : {}),
    ...(asString(record?.ContentTransferEncoding) ? { ContentTransferEncoding: asString(record?.ContentTransferEncoding) } : {}),
    ...(asString(record?.ContentType) ? { ContentType: asString(record?.ContentType) } : {}),
  };
}

function asContentValue(value: unknown): { Data: string; Charset?: string } | undefined {
  const record = asRecord(value);
  const data = asString(record?.Data);
  return data === undefined
    ? undefined
    : { Data: data, ...(asString(record?.Charset) ? { Charset: asString(record?.Charset) } : {}) };
}

function stringArray(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Email addresses must be an array of strings');
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isSesSendPath(path: string): boolean {
  return path === '/' || path === '/v2/email/outbound-emails';
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const record = asRecord(parsed);
  if (!record) {
    throw new Error('Request body must be a JSON object');
  }
  return record;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': 'application/x-amz-json-1.1; charset=utf-8',
  });
  response.end(payload);
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
