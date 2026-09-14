import { describe, expect, test, vi } from 'vitest';

import type { ViewerAwsSdkModules } from '../src/aws-sdk.js';
import type { AttributeValue } from '../src/metadata.js';
import { ViewerStore, type ViewerStoreClock } from '../src/viewer-store.js';

// Each AWS SDK command is its own class (rather than one shared stand-in) so
// the fake ddb/s3 clients below can tell commands apart with `instanceof`,
// the same way real `@aws-sdk/client-*` commands are distinguished.
class TestCommand {
  public constructor(public readonly input: unknown) {}
}
class ScanCommand extends TestCommand {}
class DeleteItemCommand extends TestCommand {}
class BatchWriteItemCommand extends TestCommand {}
class QueryCommand extends TestCommand {}
class GetObjectCommand extends TestCommand {}
class DeleteObjectCommand extends TestCommand {}
class DeleteObjectsCommand extends TestCommand {}

const sdk: ViewerAwsSdkModules = {
  DynamoDBClient: vi.fn<() => void>() as unknown as ViewerAwsSdkModules['DynamoDBClient'],
  S3Client: vi.fn<() => void>() as unknown as ViewerAwsSdkModules['S3Client'],
  QueryCommand,
  ScanCommand,
  DeleteItemCommand,
  BatchWriteItemCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
};

const item = (id: string, createdAt: string, s3Key: string): Record<string, AttributeValue> => ({
  pk: { S: 'messages' },
  sortKey: { S: `${createdAt}#${id}` },
  messageId: { S: id },
  createdAt: { S: createdAt },
  from: { S: 'sender@example.com' },
  to: { L: [{ S: 'recipient@example.com' }] },
  cc: { L: [] },
  bcc: { L: [] },
  subject: { S: 'Subject' },
  s3Key: { S: s3Key },
  size: { N: '10' },
});

const asInput = (command: unknown): Record<string, unknown> => (command as TestCommand).input as Record<string, unknown>;

const immediateClock = (): ViewerStoreClock => ({
  now: () => 0,
  wait: async () => {},
});

type Send = (command: unknown) => Promise<unknown>;
type Wait = (ms: number) => Promise<void>;

describe('ViewerStore.delete', () => {
  test('deletes DynamoDB before S3 and returns true', async () => {
    const calls: string[] = [];
    const found = [item('message-1', '2026-09-06T00:00:00.000Z', 'messages/message-1.eml')];

    const ddb = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof ScanCommand) {
          calls.push('Scan');
          return { Items: found };
        }
        if (command instanceof DeleteItemCommand) {
          calls.push('DeleteItem');
          return {};
        }
        throw new Error('unexpected ddb command');
      }),
    };
    const s3 = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof DeleteObjectCommand) {
          calls.push('DeleteObject');
          return {};
        }
        throw new Error('unexpected s3 command');
      }),
    };

    const store = new ViewerStore(ddb, s3, sdk, { tableName: 'table', bucketName: 'bucket' }, immediateClock());
    const deleted = await store.delete('message-1');

    expect(deleted).toBe(true);
    expect(calls).toEqual(['Scan', 'DeleteItem', 'DeleteObject']);

    const [, deleteItemCall] = ddb.send.mock.calls;
    expect(asInput(deleteItemCall[0])).toEqual({
      TableName: 'table',
      Key: { pk: { S: 'messages' }, sortKey: { S: '2026-09-06T00:00:00.000Z#message-1' } },
    });

    const [deleteObjectCall] = s3.send.mock.calls;
    expect(asInput(deleteObjectCall[0])).toEqual({
      Bucket: 'bucket',
      Key: 'messages/message-1.eml',
    });
  });

  test('returns false and performs no deletes when the message is missing', async () => {
    const ddb = { send: vi.fn<Send>(async () => ({ Items: [] })) };
    const s3 = { send: vi.fn<Send>(async () => ({})) };

    const store = new ViewerStore(ddb, s3, sdk, { tableName: 'table', bucketName: 'bucket' }, immediateClock());
    const deleted = await store.delete('missing');

    expect(deleted).toBe(false);
    expect(s3.send).not.toHaveBeenCalled();
    expect(ddb.send).toHaveBeenCalledTimes(1);
  });
});

describe('ViewerStore.deleteAll', () => {
  test('batches DeleteItem across 25-item chunks and multiple scan pages', async () => {
    const pageOne = Array.from({ length: 30 }, (_unused, index) =>
      item(`message-${index}`, '2026-09-06T00:00:00.000Z', `messages/message-${index}.eml`));
    const pageTwo = Array.from({ length: 5 }, (_unused, index) =>
      item(`message-${30 + index}`, '2026-09-06T00:00:00.000Z', `messages/message-${30 + index}.eml`));

    let scanCalls = 0;
    const ddb = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof ScanCommand) {
          scanCalls += 1;
          return scanCalls === 1
            ? { Items: pageOne, LastEvaluatedKey: { pk: { S: 'messages' }, sortKey: { S: 'page-1' } } }
            : { Items: pageTwo };
        }
        if (command instanceof BatchWriteItemCommand) {
          return {};
        }
        throw new Error('unexpected ddb command');
      }),
    };
    const s3 = { send: vi.fn<Send>(async () => ({})) };

    const store = new ViewerStore(ddb, s3, sdk, { tableName: 'table', bucketName: 'bucket' }, immediateClock());
    const result = await store.deleteAll(Number.POSITIVE_INFINITY);

    expect(result).toEqual({ deletedCount: 35, hasMore: false });
    expect(scanCalls).toBe(2);

    const scanInputs = ddb.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof ScanCommand)
      .map((command) => asInput(command));
    for (const input of scanInputs) {
      expect(input.ProjectionExpression).toBe('pk, sortKey, s3Key');
    }

    const batchWriteInputs = ddb.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof BatchWriteItemCommand)
      .map((command) => (asInput(command).RequestItems as Record<string, unknown[]>).table);

    // 30 items -> 25 + 5, 5 items -> 5: three BatchWriteItem chunks in total.
    expect(batchWriteInputs).toHaveLength(3);
    // eslint-disable-next-line unicorn/no-array-sort -- package targets ES2022, no toSorted
    expect(batchWriteInputs.map((requests) => requests.length).sort((a, b) => a - b)).toEqual([5, 5, 25]);

    const deleteObjectsCalls = s3.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof DeleteObjectsCommand);
    expect(deleteObjectsCalls).toHaveLength(2);
    for (const call of deleteObjectsCalls) {
      expect((asInput(call).Delete as { Quiet: boolean }).Quiet).toBe(true);
    }
  });

  test('retries UnprocessedItems with bounded backoff until they clear', async () => {
    const items = Array.from({ length: 3 }, (_unused, index) =>
      item(`message-${index}`, '2026-09-06T00:00:00.000Z', `messages/message-${index}.eml`));

    let batchWriteAttempts = 0;
    const ddb = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof ScanCommand) {
          return { Items: items };
        }
        if (command instanceof BatchWriteItemCommand) {
          batchWriteAttempts += 1;
          if (batchWriteAttempts === 1) {
            const pending = (asInput(command).RequestItems as Record<string, unknown[]>).table.slice(0, 1);
            return { UnprocessedItems: { table: pending } };
          }
          return {};
        }
        throw new Error('unexpected ddb command');
      }),
    };
    const s3 = { send: vi.fn<Send>(async () => ({})) };
    const wait = vi.fn<Wait>(async () => {});

    const store = new ViewerStore(
      ddb,
      s3,
      sdk,
      { tableName: 'table', bucketName: 'bucket' },
      { now: () => 0, wait },
    );
    const result = await store.deleteAll(Number.POSITIVE_INFINITY);

    expect(result).toEqual({ deletedCount: 3, hasMore: false });
    expect(batchWriteAttempts).toBe(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(100);
  });

  test('stops and reports hasMore once the deadline passes between scan pages', async () => {
    const pageOne = Array.from({ length: 2 }, (_unused, index) =>
      item(`message-${index}`, '2026-09-06T00:00:00.000Z', `messages/message-${index}.eml`));

    const ddb = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof ScanCommand) {
          return { Items: pageOne, LastEvaluatedKey: { pk: { S: 'messages' }, sortKey: { S: 'page-1' } } };
        }
        return {};
      }),
    };
    const s3 = { send: vi.fn<Send>(async () => ({})) };

    // The deadline is checked before each page's scan and again before each
    // BatchWriteItem chunk. The first page's single chunk (2 items) is small
    // enough that both of those first two checks still pass; time jumps past
    // the deadline only on the third check, right before the second page's
    // scan, so the first page fully completes but the second scan never runs.
    let call = 0;
    const now = () => {
      call += 1;
      return call <= 2 ? 0 : 1_000;
    };

    const store = new ViewerStore(ddb, s3, sdk, { tableName: 'table', bucketName: 'bucket' }, { now, wait: async () => {} });
    const result = await store.deleteAll(500);

    expect(result).toEqual({ deletedCount: 2, hasMore: true });
    const scanCalls = ddb.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof ScanCommand);
    expect(scanCalls).toHaveLength(1);
  });

  test('stops mid-page and reports hasMore when the deadline passes between BatchWriteItem chunks', async () => {
    // 30 items make two chunks (25 + 5); the deadline check before the
    // second chunk should stop the page early without deleting it.
    const items = Array.from({ length: 30 }, (_unused, index) =>
      item(`message-${index}`, '2026-09-06T00:00:00.000Z', `messages/message-${index}.eml`));

    const ddb = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof ScanCommand) {
          return { Items: items };
        }
        if (command instanceof BatchWriteItemCommand) {
          return {};
        }
        throw new Error('unexpected ddb command');
      }),
    };
    const s3 = { send: vi.fn<Send>(async () => ({})) };

    // Calls, in order: page-level check (before the scan), then one
    // chunk-level check per BatchWriteItem chunk. The second chunk-level
    // check (the third call overall) is the one that trips the deadline.
    let call = 0;
    const now = () => {
      call += 1;
      return call <= 2 ? 0 : 1_000;
    };

    const store = new ViewerStore(ddb, s3, sdk, { tableName: 'table', bucketName: 'bucket' }, { now, wait: async () => {} });
    const result = await store.deleteAll(500);

    expect(result).toEqual({ deletedCount: 25, hasMore: true });

    const batchWriteInputs = ddb.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof BatchWriteItemCommand)
      .map((command) => (asInput(command).RequestItems as Record<string, unknown[]>).table);
    expect(batchWriteInputs).toHaveLength(1);
    expect(batchWriteInputs[0]).toHaveLength(25);

    const deleteObjectsCalls = s3.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof DeleteObjectsCommand);
    expect(deleteObjectsCalls).toHaveLength(1);
    const deletedKeys = (asInput(deleteObjectsCalls[0]).Delete as { Objects: Array<{ Key: string }> }).Objects
      .map((object) => object.Key);
    expect(deletedKeys).toHaveLength(25);
    expect(deletedKeys).not.toContain('messages/message-25.eml');
  });

  test('counts only rows confirmed deleted and reports hasMore when retries are exhausted', async () => {
    const items = Array.from({ length: 3 }, (_unused, index) =>
      item(`message-${index}`, '2026-09-06T00:00:00.000Z', `messages/message-${index}.eml`));
    // Always echo message-0's key back as unprocessed, so retries never
    // clear and are eventually exhausted.
    const stuckKey = { pk: items[0]?.pk, sortKey: items[0]?.sortKey };

    let batchWriteAttempts = 0;
    const ddb = {
      send: vi.fn<Send>(async (command) => {
        if (command instanceof ScanCommand) {
          return { Items: items };
        }
        if (command instanceof BatchWriteItemCommand) {
          batchWriteAttempts += 1;
          return { UnprocessedItems: { table: [{ DeleteRequest: { Key: stuckKey } }] } };
        }
        throw new Error('unexpected ddb command');
      }),
    };
    const s3 = { send: vi.fn<Send>(async () => ({})) };
    const wait = vi.fn<Wait>(async () => {});

    const store = new ViewerStore(
      ddb,
      s3,
      sdk,
      { tableName: 'table', bucketName: 'bucket' },
      { now: () => 0, wait },
    );
    const result = await store.deleteAll(Number.POSITIVE_INFINITY);

    // Only message-1 and message-2 were ever confirmed deleted from
    // DynamoDB; message-0 stayed unprocessed through every retry.
    expect(result).toEqual({ deletedCount: 2, hasMore: true });
    // One initial attempt plus MAX_BATCH_WRITE_RETRIES (5) retries.
    expect(batchWriteAttempts).toBe(6);
    expect(wait).toHaveBeenCalledTimes(5);

    const deleteObjectsCalls = s3.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof DeleteObjectsCommand);
    expect(deleteObjectsCalls).toHaveLength(1);
    const deletedKeys = (asInput(deleteObjectsCalls[0]).Delete as { Objects: Array<{ Key: string }> }).Objects
      .map((object) => object.Key)
      // eslint-disable-next-line unicorn/no-array-sort -- package targets ES2022, no toSorted
      .sort();
    expect(deletedKeys).toEqual(['messages/message-1.eml', 'messages/message-2.eml']);
  });

  test('returns immediately when the deadline has already passed', async () => {
    const ddb = { send: vi.fn<Send>(async () => ({ Items: [] })) };
    const s3 = { send: vi.fn<Send>(async () => ({})) };

    const store = new ViewerStore(ddb, s3, sdk, { tableName: 'table', bucketName: 'bucket' }, { now: () => 1_000, wait: async () => {} });
    const result = await store.deleteAll(0);

    expect(result).toEqual({ deletedCount: 0, hasMore: true });
    expect(ddb.send).not.toHaveBeenCalled();
    expect(s3.send).not.toHaveBeenCalled();
  });
});
