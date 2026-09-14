import {
  apiErrorSchema,
  deleteMessagesResponseSchema,
  healthResponseSchema,
  messageDetailSchema,
  messageListResponseSchema,
} from '@ses-mail-catcher/api-contract';
import { describe, expect, test, vi } from 'vitest';

import { serveViewer, type ViewerHandlerConfig, type ViewerHandlerDependencies, type ViewerRequest } from '../src/handler.js';
import type { ViewerContent } from '../src/viewer-content.js';
import type { ViewerMessageRecord, ViewerMessageSummary, ViewerStore } from '../src/viewer-store.js';

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

const config = (overrides: Partial<ViewerHandlerConfig> = {}): ViewerHandlerConfig => ({
  tableName: 'table',
  bucketName: 'bucket',
  allowDelete: true,
  ...overrides,
});

const dependencies = (overrides: Partial<ViewerHandlerDependencies> = {}): ViewerHandlerDependencies => ({
  store: {
    list: async () => [SUMMARY],
    find: async (id: string) => id === SUMMARY.id ? RECORD : undefined,
    readRaw: async () => RAW_MIME,
    delete: async (id: string) => id === SUMMARY.id,
    deleteAll: async () => ({ deletedCount: 1, hasMore: false }),
  } as unknown as ViewerStore,
  parseContent: async () => CONTENT,
  now: () => 0,
  deleteAllBudgetMs: 20_000,
  ...overrides,
});

const request = (path: string, overrides: Partial<ViewerRequest> = {}): ViewerRequest => ({
  path,
  httpMethod: 'GET',
  ...overrides,
});

type DeleteFn = (id: string) => Promise<boolean>;
type DeleteAllFn = (deadline: number) => Promise<{ deletedCount: number; hasMore: boolean }>;

describe('routing', () => {
  test('returns the health response shape', async () => {
    const response = await serveViewer(request('/api/health'), config(), dependencies());
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(JSON.parse(response.body))).toEqual({ status: 'ok', features: { delete: true } });
  });

  test('lists and returns captured messages', async () => {
    const list = await serveViewer(request('/api/messages'), config(), dependencies());
    expect(messageListResponseSchema.parse(JSON.parse(list.body))).toEqual({ messages: [SUMMARY] });

    const detail = await serveViewer(request('/api/messages/message-1'), config(), dependencies());
    const body = messageDetailSchema.parse(JSON.parse(detail.body));
    expect(body).not.toHaveProperty('s3Key');
    expect(body.content).toMatchObject({ text: 'body', html: '<p>body</p>' });
  });

  test('serves raw messages and attachments as base64', async () => {
    const raw = await serveViewer(request('/api/messages/message-1/raw'), config(), dependencies());
    expect(raw.isBase64Encoded).toBe(true);
    expect(raw.headers['Content-Type']).toBe('message/rfc822');
    expect(Buffer.from(raw.body, 'base64')).toEqual(RAW_MIME);

    const attachment = await serveViewer(
      request('/api/messages/message-1/attachments/0'),
      config(),
      dependencies(),
    );
    expect(attachment.headers['Content-Type']).toBe('application/pdf');
    expect(attachment.headers['Content-Disposition']).toContain("filename*=UTF-8''");
  });

  test('never serves non-API paths from the API Lambda', async () => {
    const response = await serveViewer(request('/'), config(), dependencies());
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Not found' });
  });

  test('rejects writes and reports missing resources', async () => {
    const method = await serveViewer(request('/api/messages', { httpMethod: 'POST' }), config(), dependencies());
    expect(method.statusCode).toBe(405);

    const missing = await serveViewer(request('/api/messages/nope'), config(), dependencies());
    expect(missing.statusCode).toBe(404);
    expect(apiErrorSchema.parse(JSON.parse(missing.body))).toEqual({ message: 'Message not found' });
  });

  test('caps list limits before reading the store', async () => {
    const seen: number[] = [];
    const store = {
      list: async (limit: number) => {
        seen.push(limit);
        return [];
      },
    } as unknown as ViewerStore;
    await serveViewer(
      request('/api/messages', { queryStringParameters: { limit: '1001' } }),
      config(),
      dependencies({ store }),
    );
    expect(seen).toEqual([1000]);
  });
});

describe('delete', () => {
  test('deletes a single message', async () => {
    const deleteMock = vi.fn<DeleteFn>(async (id) => id === SUMMARY.id);
    const response = await serveViewer(
      request('/api/messages/message-1', { httpMethod: 'DELETE' }),
      config(),
      dependencies({ store: { delete: deleteMock } as unknown as ViewerStore }),
    );
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(deleteMock).toHaveBeenCalledExactlyOnceWith('message-1');
  });

  test('reports a 404 when deleting a message that does not exist', async () => {
    const response = await serveViewer(
      request('/api/messages/nope', { httpMethod: 'DELETE' }),
      config(),
      dependencies({ store: { delete: async () => false } as unknown as ViewerStore }),
    );
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Message not found' });
  });

  test('deletes every message and reports the shared response contract', async () => {
    const deleteAllMock = vi.fn<DeleteAllFn>(async () => ({ deletedCount: 3, hasMore: true }));
    const response = await serveViewer(
      request('/api/messages', { httpMethod: 'DELETE' }),
      config(),
      dependencies({ store: { deleteAll: deleteAllMock } as unknown as ViewerStore }),
    );
    expect(response.statusCode).toBe(200);
    expect(deleteMessagesResponseSchema.parse(JSON.parse(response.body))).toEqual({ deletedCount: 3, hasMore: true });
    expect(deleteAllMock).toHaveBeenCalledExactlyOnceWith(20_000);
  });

  test('reports delete support and gates DELETE routes behind allowDelete', async () => {
    const deleteMock = vi.fn<DeleteFn>();
    const deleteAllMock = vi.fn<DeleteAllFn>();
    const deps = dependencies({ store: { delete: deleteMock, deleteAll: deleteAllMock } as unknown as ViewerStore });

    const health = await serveViewer(request('/api/health'), config({ allowDelete: false }), deps);
    expect(healthResponseSchema.parse(JSON.parse(health.body))).toEqual({ status: 'ok', features: { delete: false } });

    const single = await serveViewer(
      request('/api/messages/message-1', { httpMethod: 'DELETE' }),
      config({ allowDelete: false }),
      deps,
    );
    expect(single.statusCode).toBe(405);

    const all = await serveViewer(
      request('/api/messages', { httpMethod: 'DELETE' }),
      config({ allowDelete: false }),
      deps,
    );
    expect(all.statusCode).toBe(405);

    expect(deleteMock).not.toHaveBeenCalled();
    expect(deleteAllMock).not.toHaveBeenCalled();
  });

  test('rejects a cross-site delete request and never touches the store', async () => {
    const deleteMock = vi.fn<DeleteFn>();
    const response = await serveViewer(
      request('/api/messages/message-1', {
        httpMethod: 'DELETE',
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      }),
      config(),
      dependencies({ store: { delete: deleteMock } as unknown as ViewerStore }),
    );
    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Cross-origin requests are not allowed' });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  test('allows a same-origin Sec-Fetch-Site value', async () => {
    const response = await serveViewer(
      request('/api/messages/message-1', {
        httpMethod: 'DELETE',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
      config(),
      dependencies(),
    );
    expect(response.statusCode).toBe(204);
  });

  test('rejects a delete request with a mismatched Origin header when Sec-Fetch-Site is absent', async () => {
    const deleteMock = vi.fn<DeleteFn>();
    const response = await serveViewer(
      request('/api/messages/message-1', {
        httpMethod: 'DELETE',
        headers: { Origin: 'https://attacker.example', Host: 'viewer.example' },
      }),
      config(),
      dependencies({ store: { delete: deleteMock } as unknown as ViewerStore }),
    );
    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Cross-origin requests are not allowed' });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  test('allows a delete request with a matching Origin header when Sec-Fetch-Site is absent', async () => {
    const response = await serveViewer(
      request('/api/messages/message-1', {
        httpMethod: 'DELETE',
        headers: { Origin: 'https://viewer.example', Host: 'viewer.example' },
      }),
      config(),
      dependencies(),
    );
    expect(response.statusCode).toBe(204);
  });

  test('allows a delete request with neither Sec-Fetch-Site nor Origin', async () => {
    const response = await serveViewer(
      request('/api/messages/message-1', { httpMethod: 'DELETE' }),
      config(),
      dependencies(),
    );
    expect(response.statusCode).toBe(204);
  });
});
