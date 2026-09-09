import { describe, expect, test } from 'vitest';

import {
  apiErrorSchema,
  healthResponseSchema,
  messageAttachmentSchema,
  messageContentSchema,
  messageDetailSchema,
  messageListResponseSchema,
  messageSummarySchema,
} from '../src/index.js';

const SUMMARY = {
  id: 'message-1',
  fromAddress: 'sender@example.com',
  toAddresses: ['recipient@example.com'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'Receipt',
  receivedAt: '2026-09-10T00:00:00.000Z',
  size: 42,
  mailbox: 'default',
};

const ATTACHMENT = {
  index: 0,
  filename: 'invoice.pdf',
  contentType: 'application/pdf',
  size: 8,
  contentId: 'part-1',
  inline: false,
};

describe('message API schemas', () => {
  test('accepts the complete summary and attachment shapes', () => {
    expect(messageSummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
    expect(messageAttachmentSchema.parse(ATTACHMENT)).toEqual(ATTACHMENT);
  });

  test('allows an omitted sender and attachment content id', () => {
    const summary = { ...SUMMARY };
    delete (summary as { fromAddress?: string }).fromAddress;
    const attachment = { ...ATTACHMENT };
    delete (attachment as { contentId?: string }).contentId;

    expect(messageSummarySchema.parse(summary)).toEqual(summary);
    expect(messageAttachmentSchema.parse(attachment)).toEqual(attachment);
  });

  test('accepts optional text and HTML independently', () => {
    expect(messageContentSchema.parse({ attachments: [] })).toEqual({ attachments: [] });
    expect(messageContentSchema.parse({ text: 'plain', attachments: [] })).toEqual({
      text: 'plain',
      attachments: [],
    });
    expect(messageContentSchema.parse({ html: '<p>html</p>', attachments: [] })).toEqual({
      html: '<p>html</p>',
      attachments: [],
    });
  });

  test('composes detail and list response shapes', () => {
    const detail = {
      ...SUMMARY,
      replyToAddresses: ['reply@example.com'],
      content: { text: 'plain', html: '<p>html</p>', attachments: [ATTACHMENT] },
    };
    const list = { messages: [SUMMARY], mailboxes: ['default', 'orders'] };

    expect(messageDetailSchema.parse(detail)).toEqual(detail);
    expect(messageListResponseSchema.parse(list)).toEqual(list);
  });

  test('rejects missing fields and wrong field types', () => {
    expect(messageSummarySchema.safeParse({ ...SUMMARY, subject: 42 }).success).toBe(false);
    expect(messageSummarySchema.safeParse({ ...SUMMARY, toAddresses: 'recipient@example.com' }).success).toBe(false);
    expect(messageContentSchema.safeParse({ text: 'plain' }).success).toBe(false);
    expect(messageDetailSchema.safeParse({ ...SUMMARY, content: { attachments: [] } }).success).toBe(false);
    expect(messageListResponseSchema.safeParse({ messages: [SUMMARY] }).success).toBe(false);
    expect(messageAttachmentSchema.safeParse({ ...ATTACHMENT, inline: 'false' }).success).toBe(false);
  });
});

describe('simple response schemas', () => {
  test('accepts health and error responses', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(apiErrorSchema.parse({ message: 'Message not found' })).toEqual({ message: 'Message not found' });
  });

  test('rejects other health statuses and non-string errors', () => {
    expect(healthResponseSchema.safeParse({ status: 'healthy' }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ message: 404 }).success).toBe(false);
  });
});
