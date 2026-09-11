import { describe, expect, test } from 'vitest';

import { validateEvent } from '../src/mail-validation.js';
import type { SendMailEvent } from '../src/event-types.js';

const validEvent = (): SendMailEvent => {
  return {
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    subject: 'Receipt',
    text: 'body',
  };
};

describe('SendMailEvent validation', () => {
  test('accepts the supported simple event shape and optional fields', () => {
    expect(() => validateEvent({
      ...validEvent(),
      cc: ['copy@example.com'],
      bcc: ['blind@example.com'],
      replyTo: ['reply@example.com'],
      html: '<p>body</p>',
      attachments: [{
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        bucket: 'mail-source',
        key: 'invoices/invoice.pdf',
      }],
      metadata: { suite: 'compatibility' },
    })).not.toThrow();
  });

  test('rejects non-object events and missing required fields', () => {
    expect(() => validateEvent(null)).toThrow('event must be an object');
    expect(() => validateEvent([])).toThrow('event must be an object');
    expect(() => validateEvent({ ...validEvent(), from: '' })).toThrow('from must be a non-empty string');
    expect(() => validateEvent({ ...validEvent(), subject: 'line\nfeed' })).toThrow('subject must be a non-empty string');
    expect(() => validateEvent({ ...validEvent(), to: [] })).toThrow('to must be a non-empty array');
  });

  test('rejects header injection and malformed optional address fields', () => {
    expect(() => validateEvent({ ...validEvent(), from: 'sender\r@example.com' })).toThrow('from must be a non-empty string');
    expect(() => validateEvent({ ...validEvent(), cc: 'copy@example.com' })).toThrow('cc must be a non-empty array');
    expect(() => validateEvent({ ...validEvent(), replyTo: [42] })).toThrow('replyTo[] must be a non-empty string');
  });

  test('requires complete S3 attachment references and metadata objects', () => {
    expect(() => validateEvent({
      ...validEvent(),
      attachments: [{ filename: 'invoice.pdf', contentType: 'application/pdf', bucket: 'mail-source' }],
    })).toThrow('attachments[].key must be a non-empty string');
    expect(() => validateEvent({ ...validEvent(), attachments: [null] })).toThrow('each attachment must be an object');
    expect(() => validateEvent({ ...validEvent(), metadata: [] })).toThrow('metadata must be an object');
  });

});

describe('SES envelope boundary', () => {
  test('does not treat Simple, Raw, or Template envelopes as custom events', () => {
    const simple = { Content: { Simple: { Subject: { Data: 'Subject' }, Body: { Text: { Data: 'body' } } } } };
    const raw = { Content: { Raw: { Data: 'cmF3' } } };
    const template = { Content: { Template: { TemplateName: 'welcome' } } };

    expect(() => validateEvent(simple)).toThrow('from must be a non-empty string');
    expect(() => validateEvent(raw)).toThrow('from must be a non-empty string');
    expect(() => validateEvent(template)).toThrow('from must be a non-empty string');
  });
});
