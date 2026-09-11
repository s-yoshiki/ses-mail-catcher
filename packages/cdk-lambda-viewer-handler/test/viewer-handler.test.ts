import {
  apiErrorSchema,
  healthResponseSchema,
  messageDetailSchema,
  messageListResponseSchema,
} from '@ses-mail-catcher/api-contract';
import { describe, expect, test, vi } from 'vitest';

import { serveViewer, type ViewerHandlerConfig, type ViewerHandlerDependencies, type ViewerRequest } from '../src/viewer-handler.js';
import type { ViewerContent } from '../src/viewer-content.js';
import type { ViewerMessageRecord, ViewerMessageSummary, ViewerStore } from '../src/viewer-store.js';
import type { StaticAsset, ViewerStatic } from '../src/viewer-static.js';

const RAW_MIME = Buffer.from('From: sender@example.com\r\nSubject: Receipt\r\n\r\nbody', 'utf8');

const SUMMARY: ViewerMessageSummary = {
  id: 'message-1',
  fromAddress: 'sender@example.com',
  toAddresses: ['recipient@example.com'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'Receipt',
  receivedAt: '2026-09-06T00:00:00.000Z',
  size: RAW_MIME.byteLength,
};

const RECORD: ViewerMessageRecord = { ...SUMMARY, replyToAddresses: [], s3Key: 'messages/message-1.eml' };

const CONTENT: ViewerContent = {
  text: 'body',
  html: '<p>body</p>',
  attachments: [{
    index: 0,
    filename: '請求書.pdf',
    contentType: 'application/pdf',
    size: 8,
    inline: false,
    content: Buffer.from('%PDF-1.4', 'utf8'),
  }],
};

const baseConfig = (overrides: Partial<ViewerHandlerConfig> = {}): ViewerHandlerConfig => {
  return {
    tableName: 'table',
    bucketName: 'bucket',
    allowedCidrs: [],
    usernameField: 'username',
    passwordField: 'password',
    ...overrides,
  };
};

const baseDependencies = (overrides: Partial<ViewerHandlerDependencies> = {}): ViewerHandlerDependencies => {
  const store = {
    list: async () => [SUMMARY],
    find: async (id: string) => id === SUMMARY.id ? RECORD : undefined,
    readRaw: async () => RAW_MIME,
  } as unknown as ViewerStore;

  const assets = {
    read: async (pathname: string): Promise<StaticAsset | undefined> => pathname.endsWith('.js')
      ? { body: Buffer.from('console.log(1);'), contentType: 'text/javascript; charset=utf-8', cacheControl: 'immutable' }
      : { body: Buffer.from('<!doctype html><div id="root"></div>'), contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' },
  } as unknown as ViewerStatic;

  return {
    store,
    assets,
    credentials: async () => undefined,
    parseContent: async () => CONTENT,
    ...overrides,
  };
};

const request = (rawPath: string, overrides: Partial<ViewerRequest> = {}): ViewerRequest => {
  return {
    rawPath,
    requestContext: { http: { method: 'GET', sourceIp: '203.0.113.9' } },
    ...overrides,
  };
};

describe('access control', () => {
  test('challenges an anonymous caller when basic auth is configured', async () => {
    const response = await serveViewer(
      request('/api/messages'),
      baseConfig(),
      baseDependencies({ credentials: async () => ({ username: 'reader', password: 'secret' }) }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.headers['WWW-Authenticate']).toContain('Basic realm');
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Authentication required' });
  });

  test('challenges a caller with invalid basic auth credentials', async () => {
    const authorization = `Basic ${Buffer.from('reader:wrong', 'utf8').toString('base64')}`;
    const response = await serveViewer(
      request('/api/messages', { headers: { Authorization: authorization } }),
      baseConfig(),
      baseDependencies({ credentials: async () => ({ username: 'reader', password: 'secret' }) }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.headers['WWW-Authenticate']).toContain('Basic realm');
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Invalid credentials' });
  });

  test('refuses an address outside the allow list without prompting', async () => {
    const response = await serveViewer(
      request('/api/messages', { requestContext: { http: { method: 'GET', sourceIp: '198.51.100.4' } } }),
      baseConfig({ allowedCidrs: ['203.0.113.0/24'] }),
      baseDependencies(),
    );

    expect(response.statusCode).toBe(403);
    expect(response.headers['WWW-Authenticate']).toBeUndefined();
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Address not allowed' });
  });

  test('accepts a caller inside the allow list with valid credentials', async () => {
    const authorization = `Basic ${Buffer.from('reader:secret').toString('base64')}`;
    const response = await serveViewer(
      request('/api/messages', { headers: { Authorization: authorization } }),
      baseConfig({ allowedCidrs: ['203.0.113.0/24'] }),
      baseDependencies({ credentials: async () => ({ username: 'reader', password: 'secret' }) }),
    );

    expect(response.statusCode).toBe(200);
  });

  test('rejects anything that is not a read', async () => {
    const response = await serveViewer(
      request('/api/messages', { requestContext: { http: { method: 'POST', sourceIp: '203.0.113.9' } } }),
      baseConfig(),
      baseDependencies(),
    );

    expect(response.statusCode).toBe(405);
  });
});

describe('routing', () => {
  test('returns the health response shape', async () => {
    const response = await serveViewer(request('/api/health'), baseConfig(), baseDependencies());

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(JSON.parse(response.body))).toEqual({ status: 'ok' });
  });

  test('lists captured messages without synthetic metadata', async () => {
    const response = await serveViewer(request('/api/messages'), baseConfig(), baseDependencies());

    expect(response.statusCode).toBe(200);
    expect(messageListResponseSchema.parse(JSON.parse(response.body))).toEqual({ messages: [SUMMARY] });
  });

  test('returns parsed content without the storage key', async () => {
    const response = await serveViewer(request('/api/messages/message-1'), baseConfig(), baseDependencies());
    const body = messageDetailSchema.parse(JSON.parse(response.body));

    expect(body).not.toHaveProperty('s3Key');
    expect(body.content).toMatchObject({ text: 'body', html: '<p>body</p>' });
    expect(body.content.attachments).toEqual([
      { index: 0, filename: '請求書.pdf', contentType: 'application/pdf', size: 8, inline: false },
    ]);
  });

  test('serves the raw message as base64', async () => {
    const response = await serveViewer(request('/api/messages/message-1/raw'), baseConfig(), baseDependencies());

    expect(response.headers['Content-Type']).toBe('message/rfc822');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.isBase64Encoded).toBe(true);
    expect(Buffer.from(response.body, 'base64')).toEqual(RAW_MIME);
  });

  test('serves an attachment with an ascii-safe disposition', async () => {
    const response = await serveViewer(
      request('/api/messages/message-1/attachments/0'),
      baseConfig(),
      baseDependencies(),
    );

    expect(response.headers['Content-Type']).toBe('application/pdf');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.isBase64Encoded).toBe(true);
    expect(response.headers['Content-Disposition']).toContain("filename*=UTF-8''");
    expect(Buffer.from(response.body, 'base64').toString('utf8')).toBe('%PDF-1.4');
  });

  test('reports missing messages and attachments', async () => {
    const missingMessage = await serveViewer(request('/api/messages/nope'), baseConfig(), baseDependencies());
    const missingAttachment = await serveViewer(
      request('/api/messages/message-1/attachments/7'),
      baseConfig(),
      baseDependencies(),
    );

    expect(missingMessage.statusCode).toBe(404);
    expect(missingAttachment.statusCode).toBe(404);
    expect(apiErrorSchema.parse(JSON.parse(missingMessage.body))).toEqual({ message: 'Message not found' });
    expect(apiErrorSchema.parse(JSON.parse(missingAttachment.body))).toEqual({ message: 'Attachment not found' });
  });

  test('never falls through to the bundle for an unknown api route', async () => {
    const response = await serveViewer(request('/api/unknown'), baseConfig(), baseDependencies());

    expect(response.statusCode).toBe(404);
    expect(response.headers['Content-Type']).toContain('application/json');
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Not found' });
  });

  test('serves the bundle for everything else', async () => {
    const index = await serveViewer(request('/'), baseConfig(), baseDependencies());
    const script = await serveViewer(request('/assets/index-abc.js'), baseConfig(), baseDependencies());

    expect(index.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(index.headers['Cache-Control']).toBe('no-store');
    expect(index.isBase64Encoded).toBe(true);
    expect(Buffer.from(index.body, 'base64').toString('utf8')).toContain('id="root"');
    expect(script.headers['Content-Type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['Cache-Control']).toBe('immutable');
    expect(script.isBase64Encoded).toBe(true);
  });

  test('normalizes list limits before calling the store', async () => {
    const list = vi.fn<(limit: number) => Promise<ViewerMessageSummary[]>>((_limit: number) => Promise.resolve([SUMMARY]));
    const store = { list } as unknown as ViewerStore;
    const dependencies = baseDependencies({ store });

    for (const [value, expected] of [['not-a-number', 100], ['0', 1], ['1001', 1000]] as const) {
      const response = await serveViewer(
        request('/api/messages', { queryStringParameters: { limit: value } }),
        baseConfig(),
        dependencies,
      );
      expect(response.statusCode).toBe(200);
      expect(messageListResponseSchema.parse(JSON.parse(response.body))).toEqual({ messages: [SUMMARY] });
      expect(list).toHaveBeenLastCalledWith(expected);
    }
  });

  test('turns an unexpected failure into a 500 rather than leaking a stack', async () => {
    const response = await serveViewer(
      request('/api/messages'),
      baseConfig(),
      baseDependencies({
        store: { list: async () => { throw new Error('table missing'); } } as unknown as ViewerStore,
      }),
    );

    expect(response.statusCode).toBe(500);
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'table missing' });
  });
});
