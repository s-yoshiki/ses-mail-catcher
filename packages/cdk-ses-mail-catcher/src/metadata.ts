import type { SendMailEvent } from './types';

/** @internal */
export interface AttributeValue {
  readonly S?: string;
  readonly N?: string;
  readonly L?: AttributeValue[];
  readonly M?: Record<string, AttributeValue>;
}

/** @internal */
export function createMetadataItem(
  event: SendMailEvent,
  messageId: string,
  createdAt: string,
  mailbox: string,
  key: string,
  size: number,
  expiresAt: number,
): Record<string, AttributeValue> {
  const item: Record<string, AttributeValue> = {
    mailbox: { S: mailbox },
    sortKey: { S: `${createdAt}#${messageId}` },
    messageId: { S: messageId },
    createdAt: { S: createdAt },
    from: { S: event.from },
    to: stringList(event.to),
    subject: { S: event.subject },
    s3Key: { S: key },
    size: { N: String(size) },
    expiresAt: { N: String(expiresAt) },
  };
  if (event.cc !== undefined) item.cc = stringList(event.cc);
  if (event.bcc !== undefined) item.bcc = stringList(event.bcc);
  if (event.replyTo !== undefined) item.replyTo = stringList(event.replyTo);
  if (event.metadata !== undefined) {
    const map: Record<string, AttributeValue> = {};
    for (const [name, value] of Object.entries(event.metadata)) map[name] = { S: value };
    item.metadata = { M: map };
  }
  return item;
}

function stringList(values: readonly string[]): AttributeValue {
  return { L: values.map((value) => ({ S: value })) };
}
