import { describe, expect, it } from 'vitest';

import { filterMessages } from '../src/filter.js';
import type { MessageSummary } from '../src/types.js';

const message = (overrides: Partial<MessageSummary> & Pick<MessageSummary, 'id'>): MessageSummary => ({
  toAddresses: [],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'Subject',
  receivedAt: '2026-09-06T00:00:00.000Z',
  size: 10,
  ...overrides,
});

describe('filterMessages', () => {
  it('returns every message unchanged for an empty or blank query', () => {
    const messages = [message({ id: 'a' }), message({ id: 'b' })];
    expect(filterMessages(messages, undefined)).toBe(messages);
    expect(filterMessages(messages, '   ')).toBe(messages);
  });

  it('matches the subject case-insensitively', () => {
    const messages = [
      message({ id: 'a', subject: 'Weekly Digest' }),
      message({ id: 'b', subject: 'Invoice' }),
    ];
    expect(filterMessages(messages, 'digest').map((m) => m.id)).toEqual(['a']);
    expect(filterMessages(messages, 'DIGEST').map((m) => m.id)).toEqual(['a']);
  });

  it('matches the sender', () => {
    const messages = [
      message({ id: 'a', fromAddress: 'ops@example.test' }),
      message({ id: 'b', fromAddress: 'sales@example.test' }),
    ];
    expect(filterMessages(messages, 'ops').map((m) => m.id)).toEqual(['a']);
  });

  it('matches the To and Cc recipients', () => {
    const messages = [
      message({ id: 'a', toAddresses: ['team@example.test'] }),
      message({ id: 'b', ccAddresses: ['archive@example.test'] }),
      message({ id: 'c', toAddresses: ['nobody@example.test'] }),
    ];
    expect(filterMessages(messages, 'team').map((m) => m.id)).toEqual(['a']);
    expect(filterMessages(messages, 'archive').map((m) => m.id)).toEqual(['b']);
  });

  it('does not match Bcc, since it is never shown to the user', () => {
    const messages = [message({ id: 'a', bccAddresses: ['secret@example.test'] })];
    expect(filterMessages(messages, 'secret')).toEqual([]);
  });

  it('returns no messages when nothing matches', () => {
    const messages = [message({ id: 'a', subject: 'Invoice' })];
    expect(filterMessages(messages, 'nonexistent')).toEqual([]);
  });
});
