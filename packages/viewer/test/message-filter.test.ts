import { describe, expect, it } from 'vitest';

import { filterMessagesByMailbox } from '../src/message-filter.js';
import type { MessageSummary } from '../src/types.js';

const messages: MessageSummary[] = [
  {
    id: 'default-message',
    fromAddress: 'sender@example.test',
    toAddresses: ['default@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Default',
    receivedAt: '2026-01-01T00:00:00.000Z',
    size: 100,
    mailbox: 'default',
  },
  {
    id: 'orders-message',
    fromAddress: 'sender@example.test',
    toAddresses: ['orders@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Orders',
    receivedAt: '2026-01-01T00:00:01.000Z',
    size: 100,
    mailbox: 'orders',
  },
];

describe('filterMessagesByMailbox', () => {
  it('returns every message for the all-mailboxes selection', () => {
    expect(filterMessagesByMailbox(messages, '')).toBe(messages);
  });

  it('filters the response defensively when a backend returns unfiltered messages', () => {
    expect(filterMessagesByMailbox(messages, 'orders')).toEqual([messages[1]]);
  });
});
