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
  /** API Gateway REST API single-value headers, keyed with their original casing. */
  readonly headers?: Record<string, string | undefined>;
  /** API Gateway REST API multi-value headers, keyed with their original casing. */
  readonly multiValueHeaders?: Record<string, string[] | undefined>;
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
  /** Whether DELETE routes are served. Read from the ALLOW_DELETE environment variable. */
  readonly allowDelete: boolean;
}

/** @internal */
export interface ViewerHandlerDependencies {
  readonly store: ViewerStore;
  /** Injected so tests do not need the vendored parser on disk. */
  readonly parseContent: (rawMime: Uint8Array) => Promise<ViewerContent>;
  /** Injected so `deleteAll`'s time budget can be driven deterministically in tests. */
  readonly now: () => number;
  /** Time budget for one `DELETE /api/messages` call. @default 20000 */
  readonly deleteAllBudgetMs: number;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

// The API Gateway REST API integration timeout is 29s; keep a margin so the
// Lambda can still return a response before API Gateway times out the call.
const DEFAULT_DELETE_ALL_BUDGET_MS = 20_000;

let cachedDependencies: ViewerHandlerDependencies | undefined;
const app = new Hono<{ Bindings: { event: LambdaEvent } }>();

// Hono owns the Lambda/API Gateway HTTP adapter. Static files are served by
// S3, so this Lambda is intentionally limited to the /api contract (read-only
// unless ALLOW_DELETE enables the DELETE routes).
app.all('*', async (context) => {
  const config = loadConfig();
  cachedDependencies ??= createDefaultDependencies(config);
  const response = await serveViewer(context.env.event as ViewerRequest, config, cachedDependencies);
  // The Fetch API forbids a body on null-body statuses (204 included), even
  // an empty string, so DELETE's 204 response must pass `null` here.
  const body = response.statusCode === 204
    ? null
    : response.isBase64Encoded ? Buffer.from(response.body, 'base64') : response.body;
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
  config: ViewerHandlerConfig,
  dependencies: ViewerHandlerDependencies,
): Promise<ViewerResponse> => {
  const method = event.httpMethod ?? event.requestContext?.http?.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    return json(405, { message: 'Method not allowed' });
  }
  if (method === 'DELETE') {
    if (!config.allowDelete) {
      return json(405, { message: 'Method not allowed' });
    }
    const blocked = sameOriginGuard(event);
    if (blocked !== undefined) {
      return blocked;
    }
  }

  const path = event.path ?? event.rawPath ?? '/';
  if (path !== '/api' && !path.startsWith('/api/')) {
    return json(404, { message: 'Not found' });
  }

  try {
    return await route(path, method, event, config, dependencies);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(500, { message });
  }
};

/**
 * Rejects cross-origin DELETE requests. Behind CloudFront the Lambda sees
 * the API Gateway host, not the browser-facing one, because the `/api/*`
 * origin request policy excludes Host — so a real browser is judged by
 * `Sec-Fetch-Site`, and `Origin`-vs-`Host` is only a fallback for the case
 * neither CloudFront nor a browser sent it. Requests with neither header
 * (a curl call, an SDK, or a test) are allowed through; no CORS headers are
 * sent, so a cross-origin browser request would fail regardless — this
 * guard exists to produce a clear 403 instead of a same-origin policy error.
 */
const sameOriginGuard = (event: ViewerRequest): ViewerResponse | undefined => {
  const secFetchSite = header(event, 'sec-fetch-site');
  if (secFetchSite !== undefined) {
    return secFetchSite === 'same-origin' || secFetchSite === 'none'
      ? undefined
      : json(403, { message: 'Cross-origin requests are not allowed' });
  }

  const origin = header(event, 'origin');
  if (origin === undefined) {
    return undefined;
  }

  return originHost(origin) === header(event, 'host')
    ? undefined
    : json(403, { message: 'Cross-origin requests are not allowed' });
};

const header = (event: ViewerRequest, name: string): string | undefined => {
  const single = findHeader(event.headers, name);
  if (single !== undefined) {
    return single;
  }
  const multiValues = findHeader(event.multiValueHeaders, name);
  return multiValues?.at(-1);
};

const findHeader = <T>(headers: Record<string, T | undefined> | undefined, name: string): T | undefined => {
  if (headers === undefined) {
    return undefined;
  }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) {
      return headers[key];
    }
  }
  return undefined;
};

const originHost = (origin: string): string | undefined => {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
};

const route = async (
  path: string,
  method: string,
  event: ViewerRequest,
  config: ViewerHandlerConfig,
  dependencies: ViewerHandlerDependencies,
): Promise<ViewerResponse> => {
  const query = event.queryStringParameters ?? {};

  if (path === '/api/health') {
    return json(200, { status: 'ok', features: { delete: config.allowDelete } });
  }
  if (path === '/api/messages') {
    if (method === 'DELETE') {
      const deadline = dependencies.now() + dependencies.deleteAllBudgetMs;
      const result = await dependencies.store.deleteAll(deadline);
      return json(200, result);
    }
    const messages = await dependencies.store.list(parseLimit(query.limit));
    return json(200, { messages });
  }

  const messageRoute = matchMessageRoute(path);
  if (messageRoute === undefined) {
    return json(404, { message: 'Not found' });
  }

  if (method === 'DELETE') {
    if (messageRoute.kind !== 'detail') {
      return json(405, { message: 'Method not allowed' });
    }
    const deleted = await dependencies.store.delete(messageRoute.id);
    return deleted ? noContent() : json(404, { message: 'Message not found' });
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
  return {
    store,
    parseContent: (rawMime) => parseViewerContent(rawMime),
    now: () => Date.now(),
    deleteAllBudgetMs: DEFAULT_DELETE_ALL_BUDGET_MS,
  };
};

const loadConfig = (): ViewerHandlerConfig => ({
  tableName: requiredEnvironment('METADATA_TABLE_NAME'),
  bucketName: requiredEnvironment('STORAGE_BUCKET_NAME'),
  allowDelete: process.env.ALLOW_DELETE === 'true',
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

const noContent = (): ViewerResponse => ({
  statusCode: 204,
  headers: {
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
  },
  body: '',
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
