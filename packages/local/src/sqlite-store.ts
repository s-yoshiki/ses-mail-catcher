import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';

import type { MessageSummary, StoredMessage } from './types.js';

interface MessageRow {
  id: string;
  from_address: string | null;
  to_addresses: string;
  cc_addresses: string;
  bcc_addresses: string;
  reply_to_addresses: string;
  subject: string;
  raw_mime: Uint8Array;
  received_at: string;
  mailbox: string;
  size?: number;
}

export class SqliteStore {
  private constructor(
    public readonly dbPath: string,
    private readonly db: DatabaseSync,
  ) {}

  public static async open(dbPath: string): Promise<SqliteStore> {
    await mkdir(dirname(dbPath), { recursive: true });

    const db = new DatabaseSync(dbPath, {
      enableForeignKeyConstraints: true,
      timeout: 5000,
    });
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_address TEXT,
        to_addresses TEXT NOT NULL,
        cc_addresses TEXT NOT NULL,
        bcc_addresses TEXT NOT NULL,
        reply_to_addresses TEXT NOT NULL,
        subject TEXT NOT NULL,
        raw_mime BLOB NOT NULL,
        received_at TEXT NOT NULL,
        mailbox TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_messages_received_at
        ON messages(received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_mailbox_received_at
        ON messages(mailbox, received_at DESC);
    `);

    return new SqliteStore(dbPath, db);
  }

  public save(message: StoredMessage): StoredMessage {
    const statement = this.db.prepare(`
      INSERT INTO messages (
        id, from_address, to_addresses, cc_addresses, bcc_addresses,
        reply_to_addresses, subject, raw_mime, received_at, mailbox
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      message.id,
      message.fromAddress ?? null,
      JSON.stringify(message.toAddresses),
      JSON.stringify(message.ccAddresses),
      JSON.stringify(message.bccAddresses),
      JSON.stringify(message.replyToAddresses),
      message.subject,
      Buffer.from(message.rawMime),
      message.receivedAt,
      message.mailbox,
    );

    return message;
  }

  public list(limit = 100, mailbox?: string): MessageSummary[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
    const statement = this.db.prepare(`
      SELECT id, from_address, to_addresses, cc_addresses, bcc_addresses,
        subject, received_at, mailbox, length(raw_mime) AS size
      FROM messages
      ${mailbox === undefined ? '' : 'WHERE mailbox = ?'}
      ORDER BY received_at DESC
      LIMIT ?
    `);

    const rows = (mailbox === undefined
      ? statement.all(boundedLimit)
      : statement.all(mailbox, boundedLimit)) as unknown as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      ...(row.from_address === null ? {} : { fromAddress: row.from_address }),
      toAddresses: parseStringArray(row.to_addresses),
      ccAddresses: parseStringArray(row.cc_addresses),
      bccAddresses: parseStringArray(row.bcc_addresses),
      subject: row.subject,
      receivedAt: row.received_at,
      size: row.size ?? 0,
      mailbox: row.mailbox,
    }));
  }

  public mailboxes(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT mailbox FROM messages ORDER BY mailbox')
      .all() as unknown as Array<{ mailbox: string }>;
    return rows.map((row) => row.mailbox);
  }

  public get(id: string): StoredMessage | undefined {
    const statement = this.db.prepare(`
      SELECT id, from_address, to_addresses, cc_addresses, bcc_addresses,
        reply_to_addresses, subject, raw_mime, received_at, mailbox
      FROM messages
      WHERE id = ?
    `);

    const row = statement.get(id) as unknown as MessageRow | undefined;
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      ...(row.from_address === null ? {} : { fromAddress: row.from_address }),
      toAddresses: parseStringArray(row.to_addresses),
      ccAddresses: parseStringArray(row.cc_addresses),
      bccAddresses: parseStringArray(row.bcc_addresses),
      replyToAddresses: parseStringArray(row.reply_to_addresses),
      subject: row.subject,
      rawMime: Buffer.from(row.raw_mime),
      receivedAt: row.received_at,
      mailbox: row.mailbox,
    };
  }

  public close(): void {
    this.db.close();
  }
}

const parseStringArray = (value: string): string[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Invalid message address data in SQLite');
  }
  return parsed;
};
