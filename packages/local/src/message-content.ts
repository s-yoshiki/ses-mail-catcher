import PostalMime from 'postal-mime';

import type {
  MessageAttachmentSummary,
  MessageContentResponse,
  MessageDetailResponse,
  StoredMessage,
} from './types.js';

export interface ParsedAttachment extends MessageAttachmentSummary {
  content: Uint8Array;
}

export interface ParsedMessageContent {
  text?: string;
  html?: string;
  attachments: ParsedAttachment[];
}

/**
 * Splits a stored message into the parts a reader cares about.
 *
 * The catcher accepts arbitrary raw MIME from whatever client is under test,
 * so this has to cope with multipart nesting, transfer encodings and charsets
 * rather than only with the messages `createSimpleMime` produces.
 */
export const parseMessageContent = async (rawMime: Uint8Array): Promise<ParsedMessageContent> => {
  const email = await PostalMime.parse(rawMime, { attachmentEncoding: 'arraybuffer' });

  return {
    ...(email.text === undefined ? {} : { text: email.text }),
    ...(email.html === undefined ? {} : { html: email.html }),
    attachments: email.attachments.map((attachment, index) => {
      const content = toBytes(attachment.content);
      return {
        index,
        filename: attachment.filename ?? `attachment-${index}`,
        contentType: attachment.mimeType,
        size: content.byteLength,
        ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
        inline: attachment.disposition === 'inline',
        content,
      };
    }),
  };
};

export const toContentResponse = (parsed: ParsedMessageContent): MessageContentResponse => {
  return {
    ...(parsed.text === undefined ? {} : { text: parsed.text }),
    ...(parsed.html === undefined ? {} : { html: parsed.html }),
    attachments: parsed.attachments.map(({ content: _content, ...summary }) => summary),
  };
};

export const toDetailResponse = async (message: StoredMessage): Promise<MessageDetailResponse> => {
  return {
    id: message.id,
    ...(message.fromAddress === undefined ? {} : { fromAddress: message.fromAddress }),
    toAddresses: message.toAddresses,
    ccAddresses: message.ccAddresses,
    bccAddresses: message.bccAddresses,
    replyToAddresses: message.replyToAddresses,
    subject: message.subject,
    receivedAt: message.receivedAt,
    size: message.rawMime.byteLength,
    content: toContentResponse(await parseMessageContent(message.rawMime)),
  };
};

const toBytes = (content: ArrayBuffer | Uint8Array | string): Uint8Array => {
  if (typeof content === 'string') {
    return Buffer.from(content, 'base64');
  }
  return content instanceof Uint8Array ? content : new Uint8Array(content);
};
