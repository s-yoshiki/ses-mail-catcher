import { Hono } from 'hono';

import { toApiMessage } from './mime.js';
import { parseMessageContent, toDetailResponse } from './message-content.js';
import { contentDisposition, parseLimit } from './viewer-api.js';
import type { SqliteStore } from './sqlite-store.js';
import type { StoredMessage } from './types.js';
import type { ViewerAssets } from './viewer-assets.js';

const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** Dependencies shared by the local mail and viewer HTTP routes. */
export interface LocalHandlerDependencies {
  readonly store: SqliteStore;
  readonly viewer: ViewerAssets | undefined;
  readonly saveMessage: (
    input: Record<string, unknown>,
    targetHeader: string | undefined,
  ) => StoredMessage;
}

/** Creates the local HTTP application using the same Hono route boundary as the AWS handlers. */
export const createApp = (dependencies: LocalHandlerDependencies): Hono => {
  const app = new Hono();

  // Keep SES protocol handling behind the same application boundary as the
  // API Gateway Lambda. The local adapter supplies a standard Request below.
  app.post('*', async (context) => {
    if (!isSesSendPath(context.req.path)) {
      return json(404, { message: 'Not found' });
    }

    try {
      const input = asRecord(await context.req.json<unknown>());
      if (input === undefined) {
        throw new Error('Request body must be a JSON object');
      }
      const message = dependencies.saveMessage(input, context.req.header('x-amz-target'));
      return sesJson(200, { MessageId: message.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid request';
      return sesJson(400, { __type: 'InvalidParameterValue', message });
    }
  });

  app.get('/health-check', () => json(200, { status: 'ok' }));
  app.get('/api/health', () => json(200, { status: 'ok' }));

  app.get('/store', (context) => listMessages(context, dependencies.store));
  app.get('/api/messages', (context) => listMessages(context, dependencies.store));
  app.get('/store/:id', (context) => legacyMessage(context, dependencies.store));
  app.get('/store/:id/raw', (context) => rawMessage(context, dependencies.store));
  app.get('/api/messages/:id', (context) => detailMessage(context, dependencies.store));
  app.get('/api/messages/:id/raw', (context) => rawMessage(context, dependencies.store));
  app.get('/api/messages/:id/attachments/:index', (context) => attachment(context, dependencies.store));

  // Static files are served by the local adapter here, while the AWS viewer
  // serves the same bundle from S3 and sends /api/* to a separate Lambda.
  app.get('*', async (context) => {
    if (dependencies.viewer === undefined) {
      if (context.req.path !== '/') {
        return json(404, { message: 'Not found' });
      }
      return json(200, {
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
    }

    const asset = await dependencies.viewer.read(context.req.path);
    return asset === undefined
      ? json(404, { message: 'Not found' })
      : new Response(toArrayBuffer(asset.body), {
        status: 200,
        headers: {
          'Cache-Control': asset.cacheControl,
          'Content-Length': String(asset.body.byteLength),
          'Content-Type': asset.contentType,
        },
      });
  });

  app.all('*', () => json(404, { message: 'Not found' }));

  app.onError((error, context) => {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return context.req.method === 'POST' && isSesSendPath(context.req.path)
      ? sesJson(400, { __type: 'InvalidParameterValue', message })
      : json(500, { message });
  });

  return app;
};

const listMessages = (context: { req: { query(name: string): string | undefined } }, store: SqliteStore): Response => {
  return json(200, { messages: store.list(parseLimit(context.req.query('limit') ?? null)) });
};

const legacyMessage = (context: { req: { param(name: string): string } }, store: SqliteStore): Response => {
  const message = store.get(context.req.param('id'));
  return message === undefined
    ? json(404, { message: 'Message not found' })
    : json(200, toApiMessage(message));
};

const detailMessage = async (
  context: { req: { param(name: string): string } },
  store: SqliteStore,
): Promise<Response> => {
  const message = store.get(context.req.param('id'));
  return message === undefined
    ? json(404, { message: 'Message not found' })
    : json(200, await toDetailResponse(message));
};

const rawMessage = (context: { req: { param(name: string): string } }, store: SqliteStore): Response => {
  const message = store.get(context.req.param('id'));
  return message === undefined
    ? json(404, { message: 'Message not found' })
    : binary(200, Buffer.from(message.rawMime), 'message/rfc822');
};

const attachment = async (
  context: { req: { param(name: string): string } },
  store: SqliteStore,
): Promise<Response> => {
  const message = store.get(context.req.param('id'));
  if (message === undefined) {
    return json(404, { message: 'Message not found' });
  }

  const index = Number.parseInt(context.req.param('index'), 10);
  if (!Number.isInteger(index) || index < 0) {
    return json(404, { message: 'Attachment not found' });
  }

  const parsed = await parseMessageContent(message.rawMime);
  const item = parsed.attachments[index];
  return item === undefined
    ? json(404, { message: 'Attachment not found' })
    : binary(200, Buffer.from(item.content), item.contentType, contentDisposition(item.filename));
};

const isSesSendPath = (path: string): boolean => {
  return path === '/' || path === '/v2/email/outbound-emails';
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
};

const json = (status: number, body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};

const sesJson = (status: number, body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/x-amz-json-1.1; charset=utf-8',
    },
  });
};

const binary = (status: number, body: Buffer, contentType: string, disposition?: string): Response => {
  return new Response(toArrayBuffer(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': 'no-store',
      ...(disposition === undefined ? {} : { 'Content-Disposition': disposition }),
      'Content-Type': contentType,
    },
  });
};

/** Copies a Node buffer into the ArrayBuffer shape accepted by the Fetch API. */
export const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
};
