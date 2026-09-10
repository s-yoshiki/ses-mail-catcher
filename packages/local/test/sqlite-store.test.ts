import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteStore } from '../src/sqlite-store.js';
import type { StoredMessage } from '../src/types.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SqliteStore', () => {
  it('persists and reads message metadata and MIME bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ses-mail-catcher-'));
    temporaryDirectories.push(directory);
    const store = await SqliteStore.open(join(directory, 'nested', 'mailbox.sqlite3'));
    const message: StoredMessage = {
      id: 'message-1',
      fromAddress: 'sender@example.com',
      toAddresses: ['recipient@example.com'],
      ccAddresses: [],
      bccAddresses: [],
      replyToAddresses: [],
      subject: 'Hello',
      rawMime: Buffer.from('Subject: Hello\r\n\r\nBody'),
      receivedAt: '2026-09-05T00:00:00.000Z',
    };

    store.save(message);
    expect(store.list()).toEqual([{
      id: message.id,
      fromAddress: message.fromAddress,
      toAddresses: message.toAddresses,
      ccAddresses: message.ccAddresses,
      bccAddresses: message.bccAddresses,
      subject: message.subject,
      receivedAt: message.receivedAt,
      size: message.rawMime.byteLength,
    }]);
    expect(store.get(message.id)).toEqual(message);
    store.close();
  });
});
