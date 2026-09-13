import { Hono } from 'hono';
import { handle, type LambdaEvent } from 'hono/aws-lambda';

import { loadViewerAwsSdk, type CommandClient } from './aws-sdk.js';
import { parseViewerContent, toAttachmentSummaries, type ViewerContent } from './viewer-content.js';
import { ViewerStore } from './viewer-store.js';

/** @internal */
export interface ViewerRequest {
  readonly path?: string;
  readonly rawPath?: string;
  readonly httpMethod?: string;
  readonly queryStringParameters?: Record<string, string | undefined>;
  readonly requestContext?: {
    readonly identity?: { readonly sourceIp?: string };
    readonly http?: { readonly method?: string };
  };
}

/** @internal */
export interface ViewerResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly isBase64Encoded?: boolean;
}

/** @internal */
export interface ViewerHandlerConfig {
  readonly tableName: string;
  readonly bucketName: string;
}

/** @internal */
export interface ViewerHandlerDependencies {
  readonly store: ViewerStore;
  /** Injected so tests do not need the vendored parser on disk. */
  readonly parseContent: (rawMime: Uint8Array) => Promise<ViewerContent>;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

let cachedDependencies: ViewerHandlerDependencies | undefined;
const app = new Hono<{ Bindings: { event: LambdaEvent } }>();

// Hono owns the Lambda/API Gateway HTTP adapter. Static files are served by
// S3, so this Lambda is intentionally limited to the read-only /api contract.
app.all('*', async (context) => {
  const config = loadConfig();
  cachedDependencies ??= createDefaultDependencies(config);
  const response = await serveViewer(context.env.event as ViewerRequest, config, cachedDependencies);
  const body = response.isBase64Encoded ? Buffer.from(response.body, 'base64') : response.body;
  return new Response(body, {
    status: response.statusCode,
    headers: response.headers,
  });
});

/** Lambda entry point for the API Gateway viewer API. */
export const handler = handle(app);

/** @internal */
export const serveViewer = async (
  event: ViewerRequest,
  _config: ViewerHandlerConfig,
  dependencies: ViewerHandlerDependencies,
): Promise<ViewerResponse> => {
  const method = event.httpMethod ?? event.requestContext?.http?.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return json(405, { message: 'Method not allowed' });
  }

  const path = event.path ?? event.rawPath ?? '/';
  if (path !== '/api' && !path.startsWith('/api/')) {
    return json(404, { message: 'Not found' });
  }

  try {
    return await route(path, event, dependencies);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(500, { message });
  }
};

const route = async (
  path: string,
  event: ViewerRequest,
  dependencies: ViewerHandlerDependencies,
): Promise<ViewerResponse> => {
  const query = event.queryStringParameters ?? {};

  if (path === '/api/health') {
    return json(200, { status: 'ok' });
  }
  if (path === '/api/messages') {
    const messages = await dependencies.store.list(parseLimit(query.limit));
    return json(200, { messages });
  }

  const messageRoute = matchMessageRoute(path);
  if (messageRoute === undefined) {
    return json(404, { message: 'Not found' });
  }

  const record = await dependencies.store.find(messageRoute.id);
  if (record === undefined) {
    return json(404, { message: 'Message not found' });
  }
  const rawMime = await dependencies.store.readRaw(record.s3Key);

  if (messageRoute.kind === 'raw') {
    return binary(200, Buffer.from(rawMime), 'message/rfc822');
  }

  const content = await dependencies.parseContent(rawMime);
  if (messageRoute.kind === 'detail') {
    const { s3Key: _s3Key, ...summary } = record;
    return json(200, {
      ...summary,
      content: {
        ...(content.text === undefined ? {} : { text: content.text }),
        ...(content.html === undefined ? {} : { html: content.html }),
        attachments: toAttachmentSummaries(content),
      },
    });
  }

  const attachment = content.attachments[messageRoute.index];
  if (attachment === undefined) {
    return json(404, { message: 'Attachment not found' });
  }
  return binary(200, Buffer.from(attachment.content), attachment.contentType, contentDisposition(attachment.filename));
};

type MessageRoute =
  | { kind: 'detail'; id: string }
  | { kind: 'raw'; id: string }
  | { kind: 'attachment'; id: string; index: number };

const matchMessageRoute = (path: string): MessageRoute | undefined => {
  const parts = path.split('/').filter(Boolean).map((part) => safeDecode(part));
  if (parts[0] !== 'api' || parts[1] !== 'messages' || parts[2] === undefined) {
    return undefined;
  }
  if (parts.length === 3) return { kind: 'detail', id: parts[2] };
  if (parts.length === 4 && parts[3] === 'raw') return { kind: 'raw', id: parts[2] };
  if (parts.length === 5 && parts[3] === 'attachments') {
    const index = Number.parseInt(parts[4], 10);
    return Number.isInteger(index) && index >= 0 ? { kind: 'attachment', id: parts[2], index } : undefined;
  }
  return undefined;
};

const createDefaultDependencies = (config: ViewerHandlerConfig): ViewerHandlerDependencies => {
  const sdk = loadViewerAwsSdk();
  const store = new ViewerStore(
    new sdk.DynamoDBClient({}) as CommandClient,
    new sdk.S3Client({}) as CommandClient,
    sdk,
    { tableName: config.tableName, bucketName: config.bucketName },
  );
  return { store, parseContent: (rawMime) => parseViewerContent(rawMime) };
};

const loadConfig = (): ViewerHandlerConfig => ({
  tableName: requiredEnvironment('METADATA_TABLE_NAME'),
  bucketName: requiredEnvironment('STORAGE_BUCKET_NAME'),
});

const parseLimit = (value: string | undefined): number => {
  const limit = Number.parseInt(value ?? '100', 10);
  return Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 1000);
};

const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const json = (statusCode: number, body: unknown): ViewerResponse => ({
  statusCode,
  headers: {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

const binary = (
  statusCode: number,
  body: Buffer,
  contentType: string,
  disposition?: string,
): ViewerResponse => ({
  statusCode,
  headers: {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    ...(disposition ? { 'Content-Disposition': disposition } : {}),
  },
  body: body.toString('base64'),
  isBase64Encoded: true,
});

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
