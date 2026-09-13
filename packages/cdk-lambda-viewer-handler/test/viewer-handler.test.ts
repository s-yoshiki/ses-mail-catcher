import {
  apiErrorSchema,
  healthResponseSchema,
  messageDetailSchema,
  messageListResponseSchema,
} from '@ses-mail-catcher/api-contract';
import { describe, expect, test } from 'vitest';

import { serveViewer, type ViewerHandlerConfig, type ViewerHandlerDependencies, type ViewerRequest } from '../src/viewer-handler.js';
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

const config: ViewerHandlerConfig = { tableName: 'table', bucketName: 'bucket' };

const dependencies = (overrides: Partial<ViewerHandlerDependencies> = {}): ViewerHandlerDependencies => ({
  store: {
    list: async () => [SUMMARY],
    find: async (id: string) => id === SUMMARY.id ? RECORD : undefined,
    readRaw: async () => RAW_MIME,
  } as unknown as ViewerStore,
  parseContent: async () => CONTENT,
  ...overrides,
});

const request = (path: string, overrides: Partial<ViewerRequest> = {}): ViewerRequest => ({
  path,
  httpMethod: 'GET',
  ...overrides,
});

describe('routing', () => {
  test('returns the health response shape', async () => {
    const response = await serveViewer(request('/api/health'), config, dependencies());
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(JSON.parse(response.body))).toEqual({ status: 'ok' });
  });

  test('lists and returns captured messages', async () => {
    const list = await serveViewer(request('/api/messages'), config, dependencies());
    expect(messageListResponseSchema.parse(JSON.parse(list.body))).toEqual({ messages: [SUMMARY] });

    const detail = await serveViewer(request('/api/messages/message-1'), config, dependencies());
    const body = messageDetailSchema.parse(JSON.parse(detail.body));
    expect(body).not.toHaveProperty('s3Key');
    expect(body.content).toMatchObject({ text: 'body', html: '<p>body</p>' });
  });

  test('serves raw messages and attachments as base64', async () => {
    const raw = await serveViewer(request('/api/messages/message-1/raw'), config, dependencies());
    expect(raw.isBase64Encoded).toBe(true);
    expect(raw.headers['Content-Type']).toBe('message/rfc822');
    expect(Buffer.from(raw.body, 'base64')).toEqual(RAW_MIME);

    const attachment = await serveViewer(
      request('/api/messages/message-1/attachments/0'),
      config,
      dependencies(),
    );
    expect(attachment.headers['Content-Type']).toBe('application/pdf');
    expect(attachment.headers['Content-Disposition']).toContain("filename*=UTF-8''");
  });

  test('never serves non-API paths from the API Lambda', async () => {
    const response = await serveViewer(request('/'), config, dependencies());
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(JSON.parse(response.body))).toEqual({ message: 'Not found' });
  });

  test('rejects writes and reports missing resources', async () => {
    const method = await serveViewer(request('/api/messages', { httpMethod: 'POST' }), config, dependencies());
    expect(method.statusCode).toBe(405);

    const missing = await serveViewer(request('/api/messages/nope'), config, dependencies());
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
      config,
      dependencies({ store }),
    );
    expect(seen).toEqual([1000]);
  });
});
