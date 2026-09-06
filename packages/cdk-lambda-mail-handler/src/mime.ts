import type { MailAttachment, SendMailEvent } from './event-types.js';

/** @internal */
export type AttachmentReader = (attachment: MailAttachment) => Promise<Uint8Array>;

const CRLF = '\r\n';

/** @internal */
export const createMimeMessage = async (
  event: SendMailEvent,
  messageId: string,
  createdAt: string,
  mailbox: string,
  readAttachment: AttachmentReader,
): Promise<string> => {
  const headers = [
    `From: ${event.from}`,
    `To: ${event.to.join(', ')}`,
    `Subject: ${encodeHeader(event.subject)}`,
    `Date: ${new Date(createdAt).toUTCString()}`,
    `Message-ID: <${messageId}@mail-catcher.local>`,
    `X-Mail-Catcher-Id: ${messageId}`,
    `X-Mailbox: ${mailbox}`,
  ];
  if (event.cc && event.cc.length > 0) headers.splice(2, 0, `Cc: ${event.cc.join(', ')}`);
  if (event.bcc && event.bcc.length > 0) headers.splice(3, 0, `Bcc: ${event.bcc.join(', ')}`);
  if (event.replyTo && event.replyTo.length > 0) headers.push(`Reply-To: ${event.replyTo.join(', ')}`);

  let content = createBody(event, messageId);
  if (event.attachments && event.attachments.length > 0) {
    const boundary = `----mail-catcher-mixed-${messageId}`;
    const parts = [
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      'MIME-Version: 1.0',
      '',
      `--${boundary}`,
      content,
    ];
    for (const attachment of event.attachments) {
      const bytes = await readAttachment(attachment);
      parts.push(
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name="${encodeParameter(attachment.filename)}"`,
        `Content-Disposition: attachment; filename="${encodeParameter(attachment.filename)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrapBase64(Buffer.from(bytes).toString('base64')),
      );
    }
    parts.push(`--${boundary}--`);
    content = parts.join(CRLF);
  }

  return headers.concat(['MIME-Version: 1.0', '', content]).join(CRLF) + CRLF;
};

const createBody = (event: SendMailEvent, messageId: string): string => {
  const text = event.text ?? '';
  const html = event.html;
  if (html === undefined) {
    return [
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(Buffer.from(text, 'utf8').toString('base64')),
    ].join(CRLF);
  }
  if (event.text === undefined) {
    return [
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(Buffer.from(html, 'utf8').toString('base64')),
    ].join(CRLF);
  }
  const boundary = `----mail-catcher-alternative-${messageId}`;
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'MIME-Version: 1.0',
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(html, 'utf8').toString('base64')),
    `--${boundary}--`,
  ].join(CRLF);
};

const encodeHeader = (value: string): string => {
  if (Buffer.from(value, 'utf8').every((byte) => byte <= 0x7f)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};

const encodeParameter = (value: string): string => {
  return value.replace(/[\\"]/g, '_');
};

const wrapBase64 = (value: string): string => {
  return value.match(/.{1,76}/g)?.join(CRLF) ?? '';
};
