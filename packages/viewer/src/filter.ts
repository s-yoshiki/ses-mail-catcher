import type { MessageSummary } from './types.js';

const matches = (message: MessageSummary, needle: string): boolean => {
  if (message.subject.toLowerCase().includes(needle)) {
    return true;
  }
  if ((message.fromAddress ?? '').toLowerCase().includes(needle)) {
    return true;
  }
  if (message.toAddresses.some((address) => address.toLowerCase().includes(needle))) {
    return true;
  }
  if (message.ccAddresses.some((address) => address.toLowerCase().includes(needle))) {
    return true;
  }
  return false;
};

/**
 * Filters messages by a free-text query, case-insensitively over subject,
 * sender, and the To/Cc recipient lists. An empty (or whitespace-only) query
 * returns every message unchanged.
 */
export const filterMessages = (messages: MessageSummary[], q: string | undefined): MessageSummary[] => {
  const needle = (q ?? '').trim().toLowerCase();
  if (needle.length === 0) {
    return messages;
  }
  return messages.filter((message) => matches(message, needle));
};
