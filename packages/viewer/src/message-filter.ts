import type { MessageSummary } from './types.js';

export const filterMessagesByMailbox = (
  messages: MessageSummary[],
  mailbox: string,
): MessageSummary[] => {
  if (mailbox === '') {
    return messages;
  }

  return messages.filter((message) => message.mailbox === mailbox);
};
