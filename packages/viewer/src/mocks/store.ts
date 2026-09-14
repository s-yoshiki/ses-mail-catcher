import { mockAttachmentBodies, mockMessages, mockRawMessages } from './data.js';
import type { AttachmentBody } from './data.js';
import type { MessageDetail } from '../types.js';

/**
 * A mutable, in-memory copy of the seed data in `data.ts`.
 *
 * The MSW handlers read and write through this store instead of the static
 * exports in `data.ts`, so a later phase can add mutating routes (for
 * example DELETE) without changing how the seed data is authored.
 */
let messages: MessageDetail[];
let rawMessages: Record<string, string>;
let attachmentBodies: Record<string, AttachmentBody>;

const clone = <T>(value: T): T => structuredClone(value);

const reset = (): void => {
  messages = clone(mockMessages);
  rawMessages = clone(mockRawMessages);
  attachmentBodies = clone(mockAttachmentBodies);
};

reset();

export const mockStore = {
  reset,

  list: (): MessageDetail[] => messages,

  /** Adds a message at the front of the list, as the newest arrival. Used to test the "new" marker. */
  add: (message: MessageDetail, raw?: string): void => {
    messages = [message, ...messages];
    if (raw !== undefined) {
      rawMessages[message.id] = raw;
    }
  },

  get: (id: string): MessageDetail | undefined => {
    return messages.find((message) => message.id === id);
  },

  remove: (id: string): boolean => {
    const index = messages.findIndex((message) => message.id === id);
    if (index === -1) {
      return false;
    }

    messages.splice(index, 1);
    delete rawMessages[id];
    for (const key of Object.keys(attachmentBodies)) {
      if (key.startsWith(`${id}/`)) {
        delete attachmentBodies[key];
      }
    }
    return true;
  },

  /** Removes every message. Returns how many were removed, for `DeleteMessagesResponse.deletedCount`. */
  clear: (): number => {
    const deletedCount = messages.length;
    messages = [];
    rawMessages = {};
    attachmentBodies = {};
    return deletedCount;
  },

  getRaw: (id: string): string | undefined => rawMessages[id],

  getAttachmentBody: (id: string, index: number): AttachmentBody | undefined => attachmentBodies[`${id}/${index}`],
};
