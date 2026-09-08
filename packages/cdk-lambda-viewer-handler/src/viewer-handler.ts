import { loadViewerAwsSdk, type CommandClient, type ViewerAwsSdkModules } from './aws-sdk.js';
import { evaluateAccess, type ViewerCredentials } from './viewer-access.js';
import { parseViewerContent, toAttachmentSummaries, type ViewerContent } from './viewer-content.js';
import { ViewerStatic } from './viewer-static.js';
import { ViewerStore } from './viewer-store.js';

/** @internal */
export interface ViewerRequest {
  readonly rawPath?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly queryStringParameters?: Record<string, string | undefined>;
  readonly requestContext?: {
    readonly http?: {
      readonly method?: string;
      readonly sourceIp?: string;
    };
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
  readonly allowedCidrs: string[];
  readonly basicAuthSecretArn?: string;
  readonly usernameField: string;
  readonly passwordField: string;
}

/** @internal */
export interface ViewerHandlerDependencies {
  readonly store: ViewerStore;
  readonly assets: ViewerStatic;
  readonly credentials: () => Promise<ViewerCredentials | undefined>;
  /** Injected so tests do not need the vendored parser on disk. */
  readonly parseContent: (rawMime: Uint8Array) => Promise<ViewerContent>;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

let cachedDependencies: ViewerHandlerDependencies | undefined;
let cachedCredentials: ViewerCredentials | undefined;

/** Lambda entry point for the viewer function URL. */
export const handler = async (event: ViewerRequest): Promise<ViewerResponse> => {
  const config = loadConfig();
  cachedDependencies ??= createDefaultDependencies(config);
  return serveViewer(event, config, cachedDependencies);
};

/** @internal */
export const serveViewer = async (
  event: ViewerRequest,
  config: ViewerHandlerConfig,
  dependencies: ViewerHandlerDependencies,
): Promise<ViewerResponse> => {
  const method = event.requestContext?.http?.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return json(405, { message: 'Method not allowed' });
  }

  const decision = evaluateAccess({
    sourceIp: event.requestContext?.http?.sourceIp,
    authorization: header(event, 'authorization'),
    allowedCidrs: config.allowedCidrs,
    credentials: await dependencies.credentials(),
  });

  if (!decision.allowed) {
    return decision.challenge === true
      ? {
        statusCode: 401,
        headers: {
          ...SECURITY_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'WWW-Authenticate': 'Basic realm="ses-mail-catcher", charset="UTF-8"',
        },
        body: JSON.stringify({ message: decision.reason ?? 'Authentication required' }),
      }
      : json(403, { message: decision.reason ?? 'Forbidden' });
  }

  const path = event.rawPath ?? '/';
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
    const limit = parseLimit(query.limit);
    const messages = await dependencies.store.list(limit);
    return json(200, { messages });
  }

  const messageRoute = matchMessageRoute(path);
  if (messageRoute === undefined) {
    return serveAsset(path, dependencies);
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
  return binary(
    200,
    Buffer.from(attachment.content),
    attachment.contentType,
    contentDisposition(attachment.filename),
  );
};

const serveAsset = async (path: string, dependencies: ViewerHandlerDependencies): Promise<ViewerResponse> => {
  if (path.startsWith('/api/')) {
    return json(404, { message: 'Not found' });
  }

  const asset = await dependencies.assets.read(path);
  if (asset === undefined) {
    return json(404, { message: 'Not found' });
  }

  return {
    statusCode: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': asset.contentType,
      'Cache-Control': asset.cacheControl,
    },
    body: asset.body.toString('base64'),
    isBase64Encoded: true,
  };
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
    assets: new ViewerStatic(),
    credentials: () => readCredentials(config, sdk),
    parseContent: (rawMime) => parseViewerContent(rawMime),
  };
};

const readCredentials = async (
  config: ViewerHandlerConfig,
  sdk: ViewerAwsSdkModules,
): Promise<ViewerCredentials | undefined> => {
  if (config.basicAuthSecretArn === undefined) {
    return undefined;
  }
  if (cachedCredentials !== undefined) {
    return cachedCredentials;
  }

  const client = new sdk.SecretsManagerClient({}) as CommandClient;
  const response = await client.send(new sdk.GetSecretValueCommand({ SecretId: config.basicAuthSecretArn }));
  const secretString = (response as { SecretString?: string }).SecretString;
  if (secretString === undefined) {
    throw new Error('viewer credentials secret has no string value');
  }

  const parsed = JSON.parse(secretString) as Record<string, unknown>;
  const username = parsed[config.usernameField];
  const password = parsed[config.passwordField];
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new Error(
      `viewer credentials secret must contain string fields "${config.usernameField}" and "${config.passwordField}"`,
    );
  }

  cachedCredentials = { username, password };
  return cachedCredentials;
};

const loadConfig = (): ViewerHandlerConfig => {
  const allowedCidrs = (process.env.VIEWER_ALLOWED_CIDRS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    tableName: requiredEnvironment('METADATA_TABLE_NAME'),
    bucketName: requiredEnvironment('STORAGE_BUCKET_NAME'),
    allowedCidrs,
    ...(process.env.VIEWER_BASIC_AUTH_SECRET_ARN
      ? { basicAuthSecretArn: process.env.VIEWER_BASIC_AUTH_SECRET_ARN }
      : {}),
    usernameField: process.env.VIEWER_BASIC_AUTH_USERNAME_FIELD ?? 'username',
    passwordField: process.env.VIEWER_BASIC_AUTH_PASSWORD_FIELD ?? 'password',
  };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

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

const header = (event: ViewerRequest, name: string): string | undefined => {
  const headers = event.headers ?? {};
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return match?.[1];
};

const json = (statusCode: number, body: unknown): ViewerResponse => {
  return {
    statusCode,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
};

const binary = (
  statusCode: number,
  body: Buffer,
  contentType: string,
  disposition?: string,
): ViewerResponse => {
  return {
    statusCode,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      ...(disposition ? { 'Content-Disposition': disposition } : {}),
    },
    body: body.toString('base64'),
    isBase64Encoded: true,
  };
};
