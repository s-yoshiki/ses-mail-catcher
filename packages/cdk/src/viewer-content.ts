import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @internal */
export interface ViewerAttachmentSummary {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  inline: boolean;
}

/** @internal */
export interface ViewerAttachment extends ViewerAttachmentSummary {
  content: Uint8Array;
}

/** @internal */
export interface ViewerContent {
  text?: string;
  html?: string;
  attachments: ViewerAttachment[];
}

interface ParsedAttachment {
  filename: string | null;
  mimeType: string;
  disposition: string | null;
  contentId?: string;
  content: ArrayBuffer | Uint8Array | string;
}

interface ParsedEmail {
  text?: string;
  html?: string;
  attachments: ParsedAttachment[];
}

interface MimeParser {
  parse(raw: Uint8Array, options?: Record<string, unknown>): Promise<ParsedEmail>;
}

// postal-mime is vendored into the Lambda asset by the package build, because
// the asset is the compiled lib directory and carries no node_modules. It is
// loaded the same way as the AWS SDK so unit tests can inject a parser.
function loadParser(): MimeParser {
  return require('./vendor/postal-mime/postal-mime.cjs') as MimeParser;
}

/** @internal */
export async function parseViewerContent(
  rawMime: Uint8Array,
  parser: MimeParser = loadParser(),
): Promise<ViewerContent> {
  const email = await parser.parse(rawMime, { attachmentEncoding: 'arraybuffer' });

  return {
    ...(email.text === undefined ? {} : { text: email.text }),
    ...(email.html === undefined ? {} : { html: email.html }),
    attachments: (email.attachments ?? []).map((attachment, index) => {
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
}

/** @internal */
export function toAttachmentSummaries(content: ViewerContent): ViewerAttachmentSummary[] {
  return content.attachments.map(({ content: _content, ...summary }) => summary);
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === 'string') {
    return Buffer.from(content, 'base64');
  }
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}
