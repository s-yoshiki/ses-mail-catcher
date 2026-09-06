import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { resolveDbPath } from './db-path.js';
import { parseMessageContent, toDetailResponse } from './message-content.js';
import { createSimpleMime, parseMimeHeaders, toApiMessage } from './mime.js';
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

interface RequestContext {
  readonly store: SqliteStore;
  readonly viewer: ViewerAssets | undefined;
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
  const context: RequestContext = { store, viewer };
  const server = createServer((request, response) => {
    void handleRequest(request, response, context);
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
  context: RequestContext,
): Promise<void> => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  try {
    if (request.method === 'POST' && isSesSendPath(url.pathname)) {
      const body = await readJson(request);
      const message = saveSesMessage(body, request.headers['x-amz-target'], context.store);
      writeSesJson(response, 200, { MessageId: message.id });
      return;
    }

    if (request.method === 'GET') {
      if (await handleApiRequest(url, response, context.store)) {
        return;
      }
      if (await handleViewerRequest(url, response, context.viewer)) {
        return;
      }
    }

    writeJson(response, 404, { message: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    if (request.method === 'POST') {
      writeSesJson(response, 400, { __type: 'InvalidParameterValue', message });
      return;
    }
    writeJson(response, 400, { message });
  }
};

/**
 * Answers the inspection API.
 *
 * `/api` is the contract the bundled viewer is built against. The original
 * `/store` routes stay as aliases so existing scripts keep working.
 */
const handleApiRequest = async (
  url: URL,
  response: ServerResponse,
  store: SqliteStore,
): Promise<boolean> => {
  if (url.pathname === '/health-check' || url.pathname === '/api/health') {
    writeJson(response, 200, { status: 'ok' });
    return true;
  }

  if (url.pathname === '/store' || url.pathname === '/api/messages') {
    const mailbox = url.searchParams.get('mailbox') ?? undefined;
    const messages = store.list(parseLimit(url.searchParams.get('limit')), mailbox);
    writeJson(response, 200, url.pathname === '/store'
      ? { messages }
      : { messages, mailboxes: store.mailboxes() });
    return true;
  }

  const route = matchMessageRoute(url.pathname);
  if (route === undefined) {
    return false;
  }

  const message = store.get(route.id);
  if (!message) {
    writeJson(response, 404, { message: 'Message not found' });
    return true;
  }

  if (route.kind === 'raw') {
    writeBinary(response, 200, Buffer.from(message.rawMime), 'message/rfc822');
    return true;
  }

  if (route.kind === 'legacy') {
    writeJson(response, 200, toApiMessage(message));
    return true;
  }

  if (route.kind === 'detail') {
    writeJson(response, 200, await toDetailResponse(message));
    return true;
  }

  const parsed = await parseMessageContent(message.rawMime);
  const attachment = parsed.attachments[route.index];
  if (!attachment) {
    writeJson(response, 404, { message: 'Attachment not found' });
    return true;
  }

  writeBinary(
    response,
    200,
    Buffer.from(attachment.content),
    attachment.contentType,
    contentDisposition(attachment.filename),
  );
  return true;
};

const handleViewerRequest = async (
  url: URL,
  response: ServerResponse,
  viewer: ViewerAssets | undefined,
): Promise<boolean> => {
  if (viewer === undefined) {
    if (url.pathname !== '/') {
      return false;
    }
    // Without a built bundle the server is still a usable API, so point at it.
    writeJson(response, 200, {
      name: 'ses-mail-catcher-local',
      viewer: 'not built',
      endpoints: [
        'POST /v2/email/outbound-emails',
        'GET /api/messages',
        'GET /api/messages/:id',
        'GET /api/messages/:id/raw',
        'GET /api/messages/:id/attachments/:index',
        'GET /api/health',
      ],
    });
    return true;
  }

  const asset = await viewer.read(url.pathname);
  if (asset === undefined) {
    return false;
  }

  response.writeHead(200, {
    'Content-Length': asset.body.byteLength,
    'Content-Type': asset.contentType,
    'Cache-Control': asset.cacheControl,
  });
  response.end(asset.body);
  return true;
};

type MessageRoute =
  | { kind: 'legacy'; id: string }
  | { kind: 'detail'; id: string }
  | { kind: 'raw'; id: string }
  | { kind: 'attachment'; id: string; index: number };

const matchMessageRoute = (pathname: string): MessageRoute | undefined => {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));

  if (parts[0] === 'store' && parts.length === 2) {
    return { kind: 'legacy', id: parts[1] };
  }
  if (parts[0] === 'store' && parts.length === 3 && parts[2] === 'raw') {
    return { kind: 'raw', id: parts[1] };
  }
  if (parts[0] !== 'api' || parts[1] !== 'messages' || parts[2] === undefined) {
    return undefined;
  }
  if (parts.length === 3) {
    return { kind: 'detail', id: parts[2] };
  }
  if (parts.length === 4 && parts[3] === 'raw') {
    return { kind: 'raw', id: parts[2] };
  }
  if (parts.length === 5 && parts[3] === 'attachments') {
    const index = Number.parseInt(parts[4], 10);
    return Number.isInteger(index) && index >= 0 ? { kind: 'attachment', id: parts[2], index } : undefined;
  }
  return undefined;
};

const parseLimit = (value: string | null): number => {
  const limit = Number.parseInt(value ?? '100', 10);
  return Number.isNaN(limit) ? 100 : limit;
};

const contentDisposition = (filename: string): string => {
  // Keep the header itself ASCII and carry the real name in the RFC 5987 form.
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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
    mailbox: readMailbox(input),
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

const readMailbox = (input: Record<string, unknown>): string => {
  const tags = Array.isArray(input.EmailTags) ? input.EmailTags : Array.isArray(input.Tags) ? input.Tags : [];
  const mailboxTag = tags.find((tag): tag is { Name: string; Value: string } => {
    const record = asRecord(tag);
    return asString(record?.Name)?.toLowerCase() === 'mailbox' && typeof record?.Value === 'string';
  });
  return mailboxTag?.Value ?? 'default';
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

const isSesSendPath = (path: string): boolean => {
  return path === '/' || path === '/v2/email/outbound-emails';
};

const readJson = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
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
};

const writeJson = (response: ServerResponse, statusCode: number, body: unknown): void => {
  writeJsonAs(response, statusCode, body, 'application/json; charset=utf-8');
};

const writeSesJson = (response: ServerResponse, statusCode: number, body: unknown): void => {
  writeJsonAs(response, statusCode, body, 'application/x-amz-json-1.1; charset=utf-8');
};

const writeJsonAs = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  contentType: string,
): void => {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': contentType,
  });
  response.end(payload);
};

const writeBinary = (
  response: ServerResponse,
  statusCode: number,
  body: Buffer,
  contentType: string,
  disposition?: string,
): void => {
  response.writeHead(statusCode, {
    'Content-Length': body.byteLength,
    'Content-Type': contentType,
    ...(disposition ? { 'Content-Disposition': disposition } : {}),
  });
  response.end(body);
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
