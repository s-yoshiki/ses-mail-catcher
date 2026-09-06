import type { MessageSummary } from 'ses-mail-catcher-api-contract';

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

// A catcher table holds a few days of test mail, so an unindexed lookup stays
// cheap. The caps keep a surprise large table from turning one request into an
// unbounded scan.
const MAX_SCAN_PAGES = 10;
const MAX_SCANNED_ITEMS = 2000;

/** @internal */
export class ViewerStore {
  public constructor(
    private readonly ddb: CommandClient,
    private readonly s3: CommandClient,
    private readonly sdk: ViewerAwsSdkModules,
    private readonly config: ViewerStoreConfig,
  ) {}

  public async list(mailbox: string | undefined, limit: number): Promise<ViewerMessageSummary[]> {
    const items = mailbox === undefined
      ? await this.scanItems(limit)
      : await this.queryMailbox(mailbox, limit);

    // `map` already produced a fresh array, and the package targets ES2022,
    // which has no `toSorted`.
    const summaries = items.map((item) => toSummary(item));
    // eslint-disable-next-line unicorn/no-array-sort
    summaries.sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
    return summaries.slice(0, limit);
  }

  public async mailboxes(): Promise<string[]> {
    const items = await this.scanItems(MAX_SCANNED_ITEMS, 'mailbox');
    // eslint-disable-next-line unicorn/no-array-sort
    return [...new Set(items.map((item) => readString(item.mailbox) ?? 'default'))].sort();
  }

  public async find(id: string, mailbox: string | undefined): Promise<ViewerMessageRecord | undefined> {
    // The table is keyed by mailbox, so a known mailbox turns this into a
    // query. Without one the message id has to be searched for.
    const items = mailbox === undefined
      ? await this.scanItems(MAX_SCANNED_ITEMS, undefined, id)
      : await this.queryMailbox(mailbox, MAX_SCANNED_ITEMS);

    const item = items.find((candidate) => readString(candidate.messageId) === id);
    if (item === undefined) {
      return undefined;
    }

    return {
      ...toSummary(item),
      replyToAddresses: readStringList(item.replyTo),
      s3Key: readString(item.s3Key) ?? '',
    };
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

  private async queryMailbox(mailbox: string, limit: number): Promise<Array<Record<string, AttributeValue>>> {
    const response = await this.ddb.send(new this.sdk.QueryCommand({
      TableName: this.config.tableName,
      KeyConditionExpression: 'mailbox = :mailbox',
      ExpressionAttributeValues: { ':mailbox': { S: mailbox } },
      ScanIndexForward: false,
      Limit: Math.min(limit, MAX_SCANNED_ITEMS),
    }));
    return readItems(response);
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

function readItems(response: unknown): Array<Record<string, AttributeValue>> {
  return (response as { Items?: Array<Record<string, AttributeValue>> }).Items ?? [];
}

function toSummary(item: Record<string, AttributeValue>): ViewerMessageSummary {
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
    mailbox: readString(item.mailbox) ?? 'default',
  };
}

function readString(value: AttributeValue | undefined): string | undefined {
  return value?.S;
}

function readStringList(value: AttributeValue | undefined): string[] {
  return (value?.L ?? []).flatMap((entry) => entry.S === undefined ? [] : [entry.S]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
