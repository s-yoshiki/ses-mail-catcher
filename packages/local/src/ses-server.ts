import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { Hono } from 'hono';

import { resolveDbPath } from './db-path.js';
import { createApp, toArrayBuffer } from './handler.js';
import { createSimpleMime, parseMimeHeaders } from './mime.js';
import { resolveHost, resolvePort } from './options.js';
import { SqliteStore } from './sqlite-store.js';
import type { StoredMessage } from './types.js';
import { ViewerAssets } from './viewer-assets.js';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export interface LocalServerOptions {
  host?: string;
  port?: number;
  dbPath?: string;
  /** Overrides where the built viewer bundle is read from. */
  viewerDir?: string;
}

export interface RunningLocalServer {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly url: string;
  readonly store: SqliteStore;
  readonly server: Server;
  /** Whether a built viewer bundle was found and is being served. */
  readonly viewerEnabled: boolean;
  close(): Promise<void>;
}

export const startServer = async (options: LocalServerOptions = {}): Promise<RunningLocalServer> => {
  const host = options.host ?? resolveHost();
  const requestedPort = options.port ?? resolvePort();
  const dbPath = options.dbPath ?? resolveDbPath();
  const store = await SqliteStore.open(dbPath);
  const viewer = await ViewerAssets.open(options.viewerDir ?? ViewerAssets.defaultRoot());
  const app = createApp({
    saveMessage: (input, targetHeader) => saveSesMessage(input, targetHeader, store),
    store,
    viewer,
  });
  const server = createServer((request, response) => {
    void handleRequest(request, response, app);
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
    viewerEnabled: viewer !== undefined,
    close: async () => {
      await closeServer(server);
      store.close();
    },
  };
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  app: Hono,
): Promise<void> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(',') : value);
      }
    }

    const body = request.method === 'POST' ? await readBody(request) : undefined;
    const result = await app.fetch(new Request(url, {
      body: body === undefined || body.byteLength === 0 ? undefined : toArrayBuffer(body),
      headers,
      method: request.method,
    }));
    const resultBody = Buffer.from(await result.arrayBuffer());
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(resultBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    const payload = JSON.stringify(request.method === 'POST'
      ? { __type: 'InvalidParameterValue', message }
      : { message });
    response.writeHead(400, {
      'Content-Length': Buffer.byteLength(payload),
      'Content-Type': request.method === 'POST'
        ? 'application/x-amz-json-1.1; charset=utf-8'
        : 'application/json; charset=utf-8',
    });
    response.end(payload);
  }
};

const saveSesMessage = (
  input: Record<string, unknown>,
  targetHeader: string | string[] | undefined,
  store: SqliteStore,
): StoredMessage => {
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
  };

  return store.save(message);
};

const createSimpleEmail = (
  input: Record<string, unknown>,
  content: Record<string, unknown> | undefined,
  toAddresses: string[],
  ccAddresses: string[],
): Uint8Array => {
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
};

const asAttachment = (value: unknown): {
  RawContent: string;
  FileName: string;
  ContentDisposition?: string;
  ContentDescription?: string;
  ContentTransferEncoding?: string;
  ContentType?: string;
} => {
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
};

const asContentValue = (value: unknown): { Data: string; Charset?: string } | undefined => {
  const record = asRecord(value);
  const data = asString(record?.Data);
  return data === undefined
    ? undefined
    : { Data: data, ...(asString(record?.Charset) ? { Charset: asString(record?.Charset) } : {}) };
};

const stringArray = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Email addresses must be an array of strings');
  }
  return value;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
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
  return Buffer.concat(chunks);
};

const listen = (server: Server, host: string, port: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
};

const closeServer = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
};
