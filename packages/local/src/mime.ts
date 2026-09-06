import { randomBytes } from 'node:crypto';

import type {
  SesV2Attachment,
  SesV2ContentValue,
  SesV2SimpleEmail,
  StoredMessage,
} from './types.js';

export interface ParsedMimeHeaders {
  fromAddress?: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
}

export const createSimpleMime = (
  fromAddress: string | undefined,
  toAddresses: string[],
  ccAddresses: string[],
  simple: SesV2SimpleEmail,
): Uint8Array => {
  const mixedBoundary = createBoundary('mixed');
  const alternativeBoundary = createBoundary('alternative');
  const hasAttachments = (simple.Attachments?.length ?? 0) > 0;
  const body = createBody(simple, alternativeBoundary);
  const mimeBody = hasAttachments
    ? createMultipartMixed(body, simple.Attachments ?? [], mixedBoundary)
    : body.content;
  const contentType = hasAttachments
    ? `multipart/mixed; boundary="${mixedBoundary}"`
    : body.contentType;

  const headers = [
    ...(fromAddress ? [`From: ${fromAddress}`] : []),
    ...(toAddresses.length > 0 ? [`To: ${toAddresses.join(', ')}`] : []),
    ...(ccAddresses.length > 0 ? [`Cc: ${ccAddresses.join(', ')}`] : []),
    `Subject: ${encodeHeader(simple.Subject.Data)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(12).toString('hex')}@ses-mail-catcher.local>`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}`,
  ];

  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${mimeBody}`, 'utf8');
};

export const parseMimeHeaders = (rawMime: Uint8Array): ParsedMimeHeaders => {
  const text = Buffer.from(rawMime).toString('utf8');
  const separator = text.search(/\r?\n\r?\n/);
  const headerText = separator === -1 ? text : text.slice(0, separator);
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  const headers = new Map<string, string>();

  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) {
      continue;
    }
    headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }

  return {
    fromAddress: headers.get('from'),
    toAddresses: parseAddressList(headers.get('to')),
    ccAddresses: parseAddressList(headers.get('cc')),
    bccAddresses: parseAddressList(headers.get('bcc')),
    subject: decodeHeader(headers.get('subject') ?? ''),
  };
};

export const toApiMessage = (message: StoredMessage): Record<string, unknown> => {
  return {
    ...message,
    rawMime: Buffer.from(message.rawMime).toString('base64'),
  };
};

const createBody = (
  simple: SesV2SimpleEmail,
  alternativeBoundary: string,
): { contentType: string; content: string } => {
  const text = simple.Body?.Text;
  const html = simple.Body?.Html;

  if (!text && !html) {
    throw new Error('Content.Simple.Body must include Text or Html');
  }

  if (text && html) {
    const content = [
      `--${alternativeBoundary}`,
      renderTextPart('text/plain', text),
      `--${alternativeBoundary}`,
      renderTextPart('text/html', html),
      `--${alternativeBoundary}--`,
    ].join('\r\n');
    return {
      contentType: `multipart/alternative; boundary="${alternativeBoundary}"`,
      content,
    };
  }

  const only = text ?? html!;
  return {
    contentType: `${text ? 'text/plain' : 'text/html'}; charset=UTF-8`,
    content: renderTextPart(text ? 'text/plain' : 'text/html', only, false),
  };
};

const createMultipartMixed = (
  body: { contentType: string; content: string },
  attachments: SesV2Attachment[],
  boundary: string,
): string => {
  const parts = [
    `--${boundary}`,
    `Content-Type: ${body.contentType}`,
    '',
    body.content,
  ];

  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.ContentType ?? 'application/octet-stream'}; name="${escapeHeader(attachment.FileName)}"`,
      `Content-Disposition: ${attachment.ContentDisposition ?? 'attachment'}; filename="${escapeHeader(attachment.FileName)}"`,
      ...(attachment.ContentDescription ? [`Content-Description: ${escapeHeader(attachment.ContentDescription)}`] : []),
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(Buffer.from(attachment.RawContent, 'base64').toString('base64')),
    );
  }

  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
};

const renderTextPart = (
  mediaType: string,
  value: SesV2ContentValue,
  includeHeaders = true,
): string => {
  const headers = includeHeaders
    ? [`Content-Type: ${mediaType}; charset=${value.Charset ?? 'UTF-8'}`, 'Content-Transfer-Encoding: base64', '']
    : [];
  return [...headers, wrapBase64(Buffer.from(value.Data, 'utf8').toString('base64'))].join('\r\n');
};

const parseAddressList = (value: string | undefined): string[] => {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
};

const encodeHeader = (value: string): string => {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};

const decodeHeader = (value: string): string => {
  return value.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, encoded: string) => {
    try {
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return encoded;
    }
  });
};

const escapeHeader = (value: string): string => {
  return value.replace(/[\\"]/g, '\\$&');
};

const wrapBase64 = (value: string): string => {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
};

const createBoundary = (kind: string): string => {
  return `----ses-mail-catcher-${kind}-${randomBytes(10).toString('hex')}`;
};
