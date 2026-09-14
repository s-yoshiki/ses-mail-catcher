import type { MessageSummary } from '@ses-mail-catcher/api-contract';

import type { CommandClient, ViewerAwsSdkModules } from './aws-sdk.js';
import type { AttributeValue } from './metadata.js';

/** @internal */
export type ViewerMessageSummary = MessageSummary;

/** @internal */
export interface ViewerMessageRecord extends ViewerMessageSummary {
  replyToAddresses: string[];
  s3Key: string;
}

/** @internal */
export interface ViewerStoreConfig {
  readonly tableName: string;
  readonly bucketName: string;
}

/**
 * The clock is injected so `deleteAll`'s time budget and the `BatchWriteItem`
 * retry backoff can be driven deterministically in tests instead of waiting
 * on real timers.
 *
 * @internal
 */
export interface ViewerStoreClock {
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
}

const DEFAULT_CLOCK: ViewerStoreClock = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  }),
};

// A catcher table holds a few days of test mail, so an unindexed lookup stays
// cheap. The caps keep a surprise large table from turning one request into an
// unbounded scan.
const MAX_SCAN_PAGES = 10;
const MAX_SCANNED_ITEMS = 2000;

// AWS-imposed limits on the batch delete APIs.
const BATCH_WRITE_CHUNK_SIZE = 25;
const DELETE_OBJECTS_CHUNK_SIZE = 1000;
// Scan a bounded number of items per deleteAll page. A page this size still
// needs up to 10 BatchWriteItem calls (25 items each); a 1000-item page could
// need 40 calls plus retry backoff, which risks overrunning the 29s API
// Gateway integration timeout under throttling. The deadline is also
// rechecked between BatchWriteItem chunks so a single page can still be
// interrupted mid-way.
const DELETE_ALL_PAGE_SIZE = 250;
const MAX_BATCH_WRITE_RETRIES = 5;

/** @internal */
export class ViewerStore {
  public constructor(
    private readonly ddb: CommandClient,
    private readonly s3: CommandClient,
    private readonly sdk: ViewerAwsSdkModules,
    private readonly config: ViewerStoreConfig,
    private readonly clock: ViewerStoreClock = DEFAULT_CLOCK,
  ) {}

  public async list(limit: number): Promise<ViewerMessageSummary[]> {
    const items = await this.scanItems(limit);

    // `map` already produced a fresh array, and the package targets ES2022,
    // which has no `toSorted`.
    const summaries = items.map((item) => toSummary(item));
    // eslint-disable-next-line unicorn/no-array-sort
    summaries.sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
    return summaries.slice(0, limit);
  }

  public async find(id: string): Promise<ViewerMessageRecord | undefined> {
    const item = await this.findItem(id);
    if (item === undefined) {
      return undefined;
    }

    return {
      ...toSummary(item),
      replyToAddresses: readStringList(item.replyTo),
      s3Key: readString(item.s3Key) ?? '',
    };
  }

  /** Deletes one message. DynamoDB is removed first so the list stays authoritative; an orphaned S3 object still expires through the bucket lifecycle. */
  public async delete(id: string): Promise<boolean> {
    const item = await this.findItem(id);
    if (item === undefined) {
      return false;
    }

    await this.ddb.send(new this.sdk.DeleteItemCommand({
      TableName: this.config.tableName,
      Key: { pk: item.pk, sortKey: item.sortKey },
    }));

    await this.s3.send(new this.sdk.DeleteObjectCommand({
      Bucket: this.config.bucketName,
      Key: readString(item.s3Key) ?? '',
    }));

    return true;
  }

  /**
   * Deletes every message, paging through the table until either everything
   * is gone or `deadline` (an absolute `Date.now()`-style timestamp) passes.
   * `hasMore` signals that items may remain so the caller can repeat the call
   * within the API Gateway integration timeout.
   */
  public async deleteAll(deadline: number): Promise<{ deletedCount: number; hasMore: boolean }> {
    let deletedCount = 0;
    let startKey: Record<string, AttributeValue> | undefined;

    for (;;) {
      if (this.clock.now() >= deadline) {
        return { deletedCount, hasMore: true };
      }

      const response = await this.ddb.send(new this.sdk.ScanCommand({
        TableName: this.config.tableName,
        ProjectionExpression: 'pk, sortKey, s3Key',
        Limit: DELETE_ALL_PAGE_SIZE,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }));

      const items = readItems(response);
      startKey = (response as { LastEvaluatedKey?: Record<string, AttributeValue> }).LastEvaluatedKey;

      if (items.length > 0) {
        const { succeeded, incomplete } = await this.batchDeleteItems(items, deadline);
        if (succeeded.length > 0) {
          await this.batchDeleteObjects(succeeded);
          deletedCount += succeeded.length;
        }
        // Some rows in this page were never confirmed deleted from DynamoDB
        // (unprocessed after retries, or the deadline hit mid-page). Stop
        // here rather than continuing to scan: a repeat DELETE /api/messages
        // call rescans from the start, so nothing is lost.
        if (incomplete) {
          return { deletedCount, hasMore: true };
        }
      }

      if (startKey === undefined) {
        return { deletedCount, hasMore: false };
      }
    }
  }

  private async findItem(id: string): Promise<Record<string, AttributeValue> | undefined> {
    const items = await this.scanItems(MAX_SCANNED_ITEMS, undefined, id);
    return items.find((candidate) => readString(candidate.messageId) === id);
  }

  /**
   * Deletes DynamoDB rows in `BATCH_WRITE_CHUNK_SIZE` chunks, retrying
   * `UnprocessedItems` with bounded backoff. Returns only the items actually
   * confirmed deleted, plus `incomplete: true` when either the deadline was
   * reached before a chunk started or retries were exhausted with rows still
   * unprocessed — in both cases the remaining items (including the rest of
   * `items`, never attempted) are left untouched in the table for a repeat
   * call to pick up.
   */
  private async batchDeleteItems(
    items: Array<Record<string, AttributeValue>>,
    deadline: number,
  ): Promise<{ succeeded: Array<Record<string, AttributeValue>>; incomplete: boolean }> {
    const succeeded: Array<Record<string, AttributeValue>> = [];

    for (const group of toChunks(items, BATCH_WRITE_CHUNK_SIZE)) {
      if (this.clock.now() >= deadline) {
        return { succeeded, incomplete: true };
      }

      let pending: DeleteRequestItem[] = group.map((item) => ({
        DeleteRequest: { Key: { pk: item.pk, sortKey: item.sortKey } },
      }));

      let attempt = 0;
      while (pending.length > 0 && attempt <= MAX_BATCH_WRITE_RETRIES) {
        if (attempt > 0) {
          await this.clock.wait(backoffMs(attempt));
        }

        const response = await this.ddb.send(new this.sdk.BatchWriteItemCommand({
          RequestItems: { [this.config.tableName]: pending },
        }));
        const unprocessed = (response as { UnprocessedItems?: Record<string, DeleteRequestItem[]> }).UnprocessedItems;
        pending = unprocessed?.[this.config.tableName] ?? [];
        attempt += 1;
      }

      if (pending.length === 0) {
        succeeded.push(...group);
        continue;
      }

      // Retries exhausted with rows still unprocessed: only the ones no
      // longer pending were actually removed from DynamoDB.
      const stillPending = new Set(pending.map((request) => itemKeyId(request.DeleteRequest.Key)));
      succeeded.push(...group.filter((item) => !stillPending.has(itemKeyId(item))));
      return { succeeded, incomplete: true };
    }

    return { succeeded, incomplete: false };
  }

  private async batchDeleteObjects(items: Array<Record<string, AttributeValue>>): Promise<void> {
    const keys = items.flatMap((item) => {
      const key = readString(item.s3Key);
      return key === undefined ? [] : [key];
    });

    for (const group of toChunks(keys, DELETE_OBJECTS_CHUNK_SIZE)) {
      await this.s3.send(new this.sdk.DeleteObjectsCommand({
        Bucket: this.config.bucketName,
        Delete: { Objects: group.map((Key) => ({ Key })), Quiet: true },
      }));
    }
  }

  public async readRaw(s3Key: string): Promise<Uint8Array> {
    const response = await this.s3.send(new this.sdk.GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: s3Key,
    }));

    const body = (response as { Body?: unknown }).Body;
    if (!body) {
      throw new Error('stored message has no body');
    }

    const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
    if (transformable.transformToByteArray) {
      return transformable.transformToByteArray();
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return concat(chunks);
  }

  private async scanItems(
    limit: number,
    projection?: string,
    messageId?: string,
  ): Promise<Array<Record<string, AttributeValue>>> {
    const items: Array<Record<string, AttributeValue>> = [];
    let startKey: Record<string, AttributeValue> | undefined;

    for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
      const response = await this.ddb.send(new this.sdk.ScanCommand({
        TableName: this.config.tableName,
        Limit: Math.min(Math.max(limit, 1), MAX_SCANNED_ITEMS),
        ...(projection ? { ProjectionExpression: projection } : {}),
        ...(messageId
          ? {
            FilterExpression: 'messageId = :messageId',
            ExpressionAttributeValues: { ':messageId': { S: messageId } },
          }
          : {}),
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }));

      items.push(...readItems(response));
      startKey = (response as { LastEvaluatedKey?: Record<string, AttributeValue> }).LastEvaluatedKey;
      if (startKey === undefined || items.length >= limit) {
        break;
      }
    }

    return items;
  }
}

type DeleteRequestItem = { DeleteRequest: { Key: Record<string, AttributeValue> } };

const readItems = (response: unknown): Array<Record<string, AttributeValue>> => {
  return (response as { Items?: Array<Record<string, AttributeValue>> }).Items ?? [];
};

const toChunks = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
};

// Exponential backoff capped at 1s, starting at 100ms on the first retry.
const backoffMs = (attempt: number): number => Math.min(100 * 2 ** (attempt - 1), 1000);

// pk is constant ('messages') and sortKey is unique per item, so the pair
// identifies a row well enough to match a BatchWriteItem UnprocessedItems
// key back to the item it came from within one chunk.
const itemKeyId = (key: Record<string, AttributeValue>): string => `${readString(key.pk) ?? ''}#${readString(key.sortKey) ?? ''}`;

const toSummary = (item: Record<string, AttributeValue>): ViewerMessageSummary => {
  const from = readString(item.from);
  return {
    id: readString(item.messageId) ?? '',
    ...(from === undefined ? {} : { fromAddress: from }),
    toAddresses: readStringList(item.to),
    ccAddresses: readStringList(item.cc),
    bccAddresses: readStringList(item.bcc),
    subject: readString(item.subject) ?? '',
    receivedAt: readString(item.createdAt) ?? '',
    size: Number.parseInt(item.size?.N ?? '0', 10),
  };
};

const readString = (value: AttributeValue | undefined): string | undefined => {
  return value?.S;
};

const readStringList = (value: AttributeValue | undefined): string[] => {
  return (value?.L ?? []).flatMap((entry) => entry.S === undefined ? [] : [entry.S]);
};

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};
