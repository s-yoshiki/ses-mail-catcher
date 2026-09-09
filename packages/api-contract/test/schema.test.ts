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

const summary = {
  id: 'message-1',
  fromAddress: 'sender@example.com',
  toAddresses: ['recipient@example.com'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'Receipt',
  receivedAt: '2026-09-06T00:00:00.000Z',
  size: 128,
};

const attachment = {
  index: 0,
  filename: 'invoice.pdf',
  contentType: 'application/pdf',
  size: 8,
  inline: false,
};

describe('message schemas', () => {
  test('accepts the complete summary and optional sender omission', () => {
    expect(messageSummarySchema.parse(summary)).toEqual(summary);
    const { fromAddress: _fromAddress, ...withoutSender } = summary;
    expect(messageSummarySchema.parse(withoutSender)).not.toHaveProperty('fromAddress');
  });

  test('accepts attachment and content variants', () => {
    expect(messageAttachmentSchema.parse({ ...attachment, contentId: 'cid-1' })).toEqual({
      ...attachment,
      contentId: 'cid-1',
    });
    expect(messageContentSchema.parse({ text: 'plain', attachments: [] })).toEqual({
      text: 'plain',
      attachments: [],
    });
    expect(messageContentSchema.parse({ html: '<p>html</p>', attachments: [attachment] })).toEqual({
      html: '<p>html</p>',
      attachments: [attachment],
    });
  });

  test('composes the detail and list response shapes', () => {
    const detail = {
      ...summary,
      replyToAddresses: ['reply@example.com'],
      content: { text: 'plain', attachments: [] },
    };

    expect(messageDetailSchema.parse(detail)).toEqual(detail);
    expect(messageListResponseSchema.parse({ messages: [summary] })).toEqual({ messages: [summary] });
  });

  test('accepts the health and API error responses', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(apiErrorSchema.parse({ message: 'Message not found' })).toEqual({ message: 'Message not found' });
  });

  test('rejects missing or incorrectly typed contract fields', () => {
    expect(messageSummarySchema.safeParse({ ...summary, size: '128' }).success).toBe(false);
    expect(messageSummarySchema.safeParse({ ...summary, toAddresses: 'recipient@example.com' }).success).toBe(false);
    expect(messageAttachmentSchema.safeParse({ ...attachment, inline: 'false' }).success).toBe(false);
    expect(messageContentSchema.safeParse({ text: 'plain' }).success).toBe(false);
    expect(messageDetailSchema.safeParse({ ...summary, content: { attachments: [] } }).success).toBe(false);
    expect(messageListResponseSchema.safeParse({ messages: [{}] }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: 'healthy' }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: 'failed' }).success).toBe(false);
  });
});
