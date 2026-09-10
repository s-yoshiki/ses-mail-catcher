import { randomUUID } from 'node:crypto';

import type { SendMailEvent } from './event-types.js';

const CRLF = '\r\n';

/** The internal event passed from the SES-compatible Function URL adapter. */
export type SesApiMailEvent = SendMailEvent & {
  readonly rawMimeBase64: string;
};

/** The request shape emitted by a Lambda Function URL. */
export interface SesApiRequest {
  readonly rawPath?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
  readonly requestContext?: {
    readonly http?: {
      readonly method?: string;
    };
  };
}

/**
 * Converts the SES v2 SendEmail JSON shape into the mail handler event shape.
 * The resulting MIME is kept as base64 so Raw and Simple messages are stored
 * using the same path and permissions as directly invoked mail events.
 */
export const toSesApiMailEvent = (
  input: Record<string, unknown>,
  targetHeader: string | undefined,
): SesApiMailEvent => {
  const operation = targetHeader?.split('.').at(-1)?.toLowerCase();
  if (operation !== undefined && operation !== 'sendemail' && operation !== 'sendrawemail') {
    throw new Error(`Unsupported SES operation: ${operation}`);
  }

  const content = asRecord(input.Content);
  if (asRecord(content?.Template) !== undefined) {
    throw new Error('Content.Template is not supported by the mail catcher API; use Content.Simple or Content.Raw');
  }
  const rawData = asString(asRecord(content?.Raw)?.Data) ?? asString(asRecord(input.RawMessage)?.Data);
  const destination = asRecord(input.Destination);
  const to = stringArray(destination?.ToAddresses);
  const cc = stringArray(destination?.CcAddresses);
  const bcc = stringArray(destination?.BccAddresses);
  const replyTo = stringArray(input.ReplyToAddresses);
  const rawMime = rawData === undefined ? undefined : Buffer.from(rawData, 'base64');
  const from = asString(input.FromEmailAddress) ?? readHeader(rawMime, 'From');
  const subject = rawMime === undefined
    ? readSimpleSubject(content)
    : readHeader(rawMime, 'Subject');
  const rawTo = to.length > 0 ? to : splitHeaderAddresses(readHeader(rawMime, 'To'));
  const rawCc = cc.length > 0 ? cc : splitHeaderAddresses(readHeader(rawMime, 'Cc'));
  const rawBcc = bcc.length > 0 ? bcc : splitHeaderAddresses(readHeader(rawMime, 'Bcc'));

  requireString(from, 'FromEmailAddress or raw From header');
  requireString(subject, 'Subject');
  if (rawTo.length === 0) {
    throw new Error('Destination.ToAddresses or a raw To header is required');
  }

  const metadata = readMetadata(input);
  if (rawMime !== undefined) {
    return {
      from,
      to: rawTo,
      ...(rawCc.length > 0 ? { cc: rawCc } : {}),
      ...(rawBcc.length > 0 ? { bcc: rawBcc } : {}),
      ...(replyTo.length > 0 ? { replyTo } : {}),
      subject,
      ...(metadata === undefined ? {} : { metadata }),
      rawMimeBase64: rawMime.toString('base64'),
    };
  }

  const simple = asRecord(content?.Simple);
  if (simple === undefined) {
    throw new Error('Content.Simple or Content.Raw is required');
  }

  const text = readContentValue(asRecord(asRecord(simple.Body)?.Text));
  const html = readContentValue(asRecord(asRecord(simple.Body)?.Html));
  const attachments = readAttachments(simple.Attachments);
  if (text === undefined && html === undefined) {
    throw new Error('Content.Simple.Body.Text or Content.Simple.Body.Html is required');
  }

  const simpleMime = createSimpleMime({
    from,
    to: rawTo,
    cc: rawCc,
    bcc: rawBcc,
    replyTo,
    subject,
    text,
    html,
    attachments,
  });
  return {
    from,
    to: rawTo,
    ...(rawCc.length > 0 ? { cc: rawCc } : {}),
    ...(rawBcc.length > 0 ? { bcc: rawBcc } : {}),
    ...(replyTo.length > 0 ? { replyTo } : {}),
    subject,
    ...(text === undefined ? {} : { text }),
    ...(html === undefined ? {} : { html }),
    ...(metadata === undefined ? {} : { metadata }),
    rawMimeBase64: simpleMime.toString('base64'),
  };
};

const createSimpleMime = (message: {
  readonly from: string;
  readonly to: string[];
  readonly cc: string[];
  readonly bcc: string[];
  readonly replyTo: string[];
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly attachments: SesAttachment[];
}): Buffer => {
  const body = createBody(message.text, message.html);
  const content = message.attachments.length === 0
    ? body
    : createMixedBody(body, message.attachments);
  const headers = [
    `From: ${safeHeader(message.from)}`,
    `To: ${message.to.map(safeHeader).join(', ')}`,
    ...(message.cc.length === 0 ? [] : [`Cc: ${message.cc.map(safeHeader).join(', ')}`]),
    ...(message.bcc.length === 0 ? [] : [`Bcc: ${message.bcc.map(safeHeader).join(', ')}`]),
    ...(message.replyTo.length === 0 ? [] : [`Reply-To: ${message.replyTo.map(safeHeader).join(', ')}`]),
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    content,
    '',
  ];
  return Buffer.from(headers.join(CRLF), 'utf8');
};

const createBody = (text: string | undefined, html: string | undefined): string => {
  if (html === undefined) {
    return [
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(text ?? ''),
    ].join(CRLF);
  }
  if (text === undefined) {
    return [
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(html),
    ].join(CRLF);
  }

  const boundary = `ses-mail-catcher-alternative-${randomUUID()}`;
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'MIME-Version: 1.0',
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(html),
    `--${boundary}--`,
  ].join(CRLF);
};

const createMixedBody = (body: string, attachments: SesAttachment[]): string => {
  const boundary = `ses-mail-catcher-mixed-${randomUUID()}`;
  const parts = [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    'MIME-Version: 1.0',
    '',
    `--${boundary}`,
    body,
  ];
  for (const attachment of attachments) {
    const disposition = attachment.disposition.toLowerCase() === 'inline' ? 'inline' : 'attachment';
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${encodeParameter(attachment.filename)}"`,
      `Content-Disposition: ${disposition}; filename="${encodeParameter(attachment.filename)}"`,
      'Content-Transfer-Encoding: base64',
      ...(attachment.description === undefined ? [] : [`Content-Description: ${safeHeader(attachment.description)}`]),
      ...(attachment.contentId === undefined ? [] : [`Content-ID: <${safeHeader(attachment.contentId)}>`]),
      '',
      wrapRawBase64(attachment.rawContentBase64),
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join(CRLF);
};

interface SesAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly rawContentBase64: string;
  readonly disposition: string;
  readonly description?: string;
  readonly contentId?: string;
}

const readAttachments = (value: unknown): SesAttachment[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Content.Simple.Attachments must be an array');
  return value.map((item) => {
    const attachment = asRecord(item);
    const rawContentBase64 = asString(attachment?.RawContent);
    const filename = asString(attachment?.FileName);
    if (rawContentBase64 === undefined || filename === undefined) {
      throw new Error('attachments require RawContent and FileName');
    }
    return {
      rawContentBase64,
      filename,
      contentType: asString(attachment?.ContentType) ?? 'application/octet-stream',
      disposition: asString(attachment?.ContentDisposition) ?? 'ATTACHMENT',
      ...(asString(attachment?.ContentDescription) === undefined
        ? {}
        : { description: asString(attachment?.ContentDescription) }),
      ...(asString(attachment?.ContentId) === undefined ? {} : { contentId: asString(attachment?.ContentId) }),
    };
  });
};

const readSimpleSubject = (content: Record<string, unknown> | undefined): string | undefined => {
  return readContentValue(asRecord(asRecord(content?.Simple)?.Subject));
};

const readContentValue = (value: Record<string, unknown> | undefined): string | undefined => {
  return asString(value?.Data);
};

const readMetadata = (input: Record<string, unknown>): Record<string, string> | undefined => {
  const tags = Array.isArray(input.EmailTags) ? input.EmailTags : [];
  const entries = tags
    .map(asRecord)
    .flatMap((tag) => {
      const name = asString(tag?.Name);
      const value = asString(tag?.Value);
      return name === undefined || value === undefined
        ? []
        : [[name, value] as const];
    });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

const readHeader = (rawMime: Buffer | undefined, name: string): string | undefined => {
  if (rawMime === undefined) return undefined;
  const pattern = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)$`, 'im');
  const match = pattern.exec(rawMime.toString('utf8'));
  return match?.[1]?.replace(/\\r?\\n[ \\t]+/g, ' ').trim();
};

const splitHeaderAddresses = (value: string | undefined): string[] => {
  return value === undefined ? [] : value.split(',').map((entry) => entry.trim()).filter(Boolean);
};

const requireString: (value: string | undefined, name: string) => asserts value is string = (value, name) => {
  if (value === undefined || value.length === 0 || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a non-empty string without CR or LF`);
  }
};

const stringArray = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Email addresses must be an array of strings');
  }
  return value;
};

const encodeHeader = (value: string): string => {
  if (Buffer.from(value, 'utf8').every((byte) => byte <= 0x7f)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};

const encodeParameter = (value: string): string => value.replace(/[\\"]/g, '_');

const safeHeader = (value: string): string => value.replace(/[\r\n]+/g, ' ');

const wrapBase64 = (value: string): string => {
  return wrapRawBase64(Buffer.from(value, 'utf8').toString('base64'));
};

const wrapRawBase64 = (value: string): string => value.match(/.{1,76}/g)?.join(CRLF) ?? '';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};
