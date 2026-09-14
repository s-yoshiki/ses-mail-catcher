import { randomUUID } from 'node:crypto';

const CRLF = '\r\n';

/** @internal */
export type SesApiProtocol = 'v1' | 'v2';

/** @internal */
export interface SesApiMailEvent {
  readonly from: string;
  readonly to: string[];
  readonly cc?: string[];
  readonly bcc?: string[];
  readonly replyTo?: string[];
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly metadata?: Record<string, string>;
  /** The canonical MIME message, encoded for transport between adapters. */
  readonly rawMimeBase64: string;
}

/** API Gateway REST or HTTP proxy event fields used by the adapter. */
export interface SesApiRequest {
  readonly path?: string;
  readonly rawPath?: string;
  readonly httpMethod?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext?: {
    readonly identity?: { readonly sourceIp?: string };
    readonly http?: { readonly method?: string };
  };
}

/**
 * Converts an SES v2 SendEmail request into the common capture event.
 * Templates are intentionally outside the scope of the mail catcher.
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

  const rawData = asString(asRecord(content?.Raw)?.Data);
  const rawMime = rawData === undefined ? undefined : decodeBase64(rawData);
  const destination = asRecord(input.Destination);
  const to = stringArray(destination?.ToAddresses);
  const cc = stringArray(destination?.CcAddresses);
  const bcc = stringArray(destination?.BccAddresses);
  const replyTo = stringArray(input.ReplyToAddresses);
  const from = asString(input.FromEmailAddress) ?? readHeader(rawMime, 'From');
  const subject = rawMime === undefined
    ? readSimpleSubject(content)
    : readHeader(rawMime, 'Subject');
  const rawTo = to.length > 0 ? to : splitHeaderAddresses(readHeader(rawMime, 'To'));
  const rawCc = cc.length > 0 ? cc : splitHeaderAddresses(readHeader(rawMime, 'Cc'));
  const rawBcc = bcc.length > 0 ? bcc : splitHeaderAddresses(readHeader(rawMime, 'Bcc'));

  requireString(from, 'FromEmailAddress or raw From header');
  requireString(subject, 'Subject');
  requireAddresses(rawTo, 'Destination.ToAddresses or raw To header');

  const metadata = readMetadata(input.EmailTags);
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

  return createEvent({
    from,
    to: rawTo,
    cc: rawCc,
    bcc: rawBcc,
    replyTo,
    subject,
    text,
    html,
    attachments,
    metadata,
  });
};

/** Converts the SES API v1 Query protocol into the common capture event. */
export const toSesQueryMailEvent = (params: URLSearchParams): SesApiMailEvent => {
  const action = params.get('Action')?.toLowerCase();
  if (action !== 'sendemail' && action !== 'sendrawemail') {
    throw new Error('Action must be SendEmail or SendRawEmail');
  }

  const rawData = params.get('RawMessage.Data');
  const rawMime = rawData === null ? undefined : decodeBase64(rawData);
  const from = params.get('Source') ?? readHeader(rawMime, 'From');
  const to = rawMime === undefined
    ? indexedValues(params, 'Destination.ToAddresses')
    : indexedValues(params, 'Destinations').length > 0
      ? indexedValues(params, 'Destinations')
      : splitHeaderAddresses(readHeader(rawMime, 'To'));
  const cc = rawMime === undefined
    ? indexedValues(params, 'Destination.CcAddresses')
    : splitHeaderAddresses(readHeader(rawMime, 'Cc'));
  const bcc = rawMime === undefined
    ? indexedValues(params, 'Destination.BccAddresses')
    : splitHeaderAddresses(readHeader(rawMime, 'Bcc'));
  const replyTo = indexedValues(params, 'ReplyToAddresses');
  const subject = rawMime === undefined
    ? params.get('Message.Subject.Data') ?? undefined
    : readHeader(rawMime, 'Subject');

  requireString(from, 'Source or raw From header');
  requireString(subject, 'Message.Subject.Data or raw Subject header');
  requireAddresses(to, 'Destination.ToAddresses or Destinations');

  const metadata = readQueryMetadata(params);
  if (rawMime !== undefined) {
    return {
      from,
      to,
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
      ...(replyTo.length > 0 ? { replyTo } : {}),
      subject,
      ...(metadata === undefined ? {} : { metadata }),
      rawMimeBase64: rawMime.toString('base64'),
    };
  }

  const text = optionalQueryValue(params, 'Message.Body.Text.Data');
  const html = optionalQueryValue(params, 'Message.Body.Html.Data');
  if (text === undefined && html === undefined) {
    throw new Error('Message.Body.Text.Data or Message.Body.Html.Data is required');
  }

  return createEvent({
    from,
    to,
    cc,
    bcc,
    replyTo,
    subject,
    text,
    html,
    attachments: [],
    metadata,
  });
};

interface SimpleAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly rawContentBase64: string;
  readonly disposition: string;
  readonly description?: string;
  readonly contentId?: string;
}

const createEvent = (message: {
  readonly from: string;
  readonly to: string[];
  readonly cc: string[];
  readonly bcc: string[];
  readonly replyTo: string[];
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly attachments: SimpleAttachment[];
  readonly metadata?: Record<string, string>;
}): SesApiMailEvent => {
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
  return {
    from: message.from,
    to: message.to,
    ...(message.cc.length > 0 ? { cc: message.cc } : {}),
    ...(message.bcc.length > 0 ? { bcc: message.bcc } : {}),
    ...(message.replyTo.length > 0 ? { replyTo: message.replyTo } : {}),
    subject: message.subject,
    ...(message.text === undefined ? {} : { text: message.text }),
    ...(message.html === undefined ? {} : { html: message.html }),
    ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
    rawMimeBase64: Buffer.from(headers.join(CRLF), 'utf8').toString('base64'),
  };
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

const createMixedBody = (body: string, attachments: SimpleAttachment[]): string => {
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

const readAttachments = (value: unknown): SimpleAttachment[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Content.Simple.Attachments must be an array');
  return value.map((item) => {
    const attachment = asRecord(item);
    const rawContentBase64 = asString(attachment?.RawContent);
    const filename = asString(attachment?.FileName);
    if (rawContentBase64 === undefined || filename === undefined) {
      throw new Error('attachments require RawContent and FileName');
    }
    requireString(filename, 'attachments[].FileName');
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

const readMetadata = (value: unknown): Record<string, string> | undefined => {
  const tags = Array.isArray(value) ? value : [];
  const entries = tags.flatMap((tag) => {
    const record = asRecord(tag);
    const name = asString(record?.Name);
    const tagValue = asString(record?.Value);
    return name === undefined || tagValue === undefined ? [] : [[name, tagValue] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

const readQueryMetadata = (params: URLSearchParams): Record<string, string> | undefined => {
  const indexes = [...params.keys()]
    .flatMap((key) => {
      const match = /^Tags\.member\.(\d+)\.(?:Name|Value)$/.exec(key);
      return match === null ? [] : [Number(match[1])];
    });
  // eslint-disable-next-line unicorn/no-array-sort
  const entries = [...new Set(indexes)].sort((left, right) => left - right).flatMap((number) => {
    const name = params.get(`Tags.member.${number}.Name`);
    const value = params.get(`Tags.member.${number}.Value`);
    return name === null || value === null ? [] : [[name, value] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

const indexedValues = (params: URLSearchParams, prefix: string): string[] => {
  return [...params.entries()]
    .flatMap(([key, value]) => {
      const match = new RegExp(`^${escapeRegExp(prefix)}\\.member\\.(\\d+)$`).exec(key);
      return match === null ? [] : [{ index: Number(match[1]), value }];
    })
    // eslint-disable-next-line unicorn/no-array-sort
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.value);
};

const optionalQueryValue = (params: URLSearchParams, key: string): string | undefined => {
  const value = params.get(key);
  return value === null ? undefined : value;
};

const readHeader = (rawMime: Buffer | undefined, name: string): string | undefined => {
  if (rawMime === undefined) return undefined;
  const pattern = new RegExp(`^${escapeRegExp(name)}:\\s*(.+(?:\\r?\\n[ \\t].+)*)$`, 'im');
  const match = pattern.exec(rawMime.toString('utf8'));
  return match?.[1]?.replace(/\r?\n[ \t]+/g, ' ').trim();
};

const splitHeaderAddresses = (value: string | undefined): string[] => {
  return value === undefined ? [] : value.split(',').map((entry) => entry.trim()).filter(Boolean);
};

const requireString: (value: string | undefined, name: string) => asserts value is string = (value, name) => {
  if (value === undefined || value.length === 0 || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a non-empty string without CR or LF`);
  }
};

const requireAddresses = (value: string[], name: string): void => {
  if (value.length === 0) throw new Error(`${name} must contain at least one address`);
  for (const address of value) requireString(address, `${name}[]`);
};

const stringArray = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Email addresses must be an array of strings');
  }
  return value;
};

const decodeBase64 = (value: string): Buffer => {
  if (value.length === 0) throw new Error('raw message data must not be empty');
  return Buffer.from(value, 'base64');
};

const encodeHeader = (value: string): string => {
  if (Buffer.from(value, 'utf8').every((byte) => byte <= 0x7f)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};

const encodeParameter = (value: string): string => value.replace(/[\\"]/g, '_');

const safeHeader = (value: string): string => value.replace(/[\r\n]+/g, ' ');

const wrapBase64 = (value: string): string => wrapRawBase64(Buffer.from(value, 'utf8').toString('base64'));

const wrapRawBase64 = (value: string): string => value.match(/.{1,76}/g)?.join(CRLF) ?? '';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};
