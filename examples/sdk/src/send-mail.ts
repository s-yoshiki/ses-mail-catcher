import {
  CreateEmailTemplateCommand,
  SESv2Client,
  SendEmailCommand,
  UpdateEmailTemplateCommand,
  type EmailContent,
  type Message,
} from '@aws-sdk/client-sesv2';

type MailPattern = 'text' | 'html' | 'multipart' | 'attachment' | 'raw' | 'template';

const mailPatterns = new Set<MailPattern>([
  'text',
  'html',
  'multipart',
  'attachment',
  'raw',
  'template',
]);

const splitAddresses = (value: string, variableName: string): string[] => {
  const addresses = value
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  if (addresses.length === 0) {
    throw new Error(`${variableName} must contain at least one address`);
  }
  return addresses;
};

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const wrapBase64 = (value: string): string => {
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
};

const encodeMimeHeader = (value: string): string => {
  if (Buffer.from(value, 'utf8').every((byte) => byte <= 0x7F)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};

const safeHeaderValue = (value: string): string => value.replaceAll('\r', ' ').replaceAll('\n', ' ');

const getMailPattern = (): MailPattern => {
  const defaultPattern = process.env.MAIL_TEMPLATE_NAME !== undefined
    ? 'template'
    : process.env.MAIL_HTML !== undefined
      ? 'multipart'
      : 'text';
  const value = process.env.MAIL_PATTERN ?? defaultPattern;
  if (!mailPatterns.has(value as MailPattern)) {
    throw new Error(`MAIL_PATTERN must be one of: ${[...mailPatterns].join(', ')}`);
  }
  return value as MailPattern;
};

const sesMailCatcherUrl = process.env.SES_MAIL_CATCHER_URL ?? 'http://127.0.0.1:8005';
const from = process.env.MAIL_FROM ?? 'noreply@example.com';
const to = splitAddresses(process.env.MAIL_TO ?? 'developer@example.com', 'MAIL_TO');
const cc = process.env.MAIL_CC === undefined
  ? undefined
  : splitAddresses(process.env.MAIL_CC, 'MAIL_CC');
const bcc = process.env.MAIL_BCC === undefined
  ? undefined
  : splitAddresses(process.env.MAIL_BCC, 'MAIL_BCC');
const replyTo = process.env.MAIL_REPLY_TO === undefined
  ? undefined
  : splitAddresses(process.env.MAIL_REPLY_TO, 'MAIL_REPLY_TO');
// Keep the defaults multilingual so every mail pattern exercises UTF-8
// handling, including Japanese text and emoji.
const subject = process.env.MAIL_SUBJECT ?? '日本語と絵文字を含む SDK サンプル 📬';
const text = process.env.MAIL_TEXT ?? 'こんにちは、ses-mail-catcher の SDK サンプルです。日本語と絵文字が正しく表示されることを確認します。📧✨';
const pattern = getMailPattern();
const generatedHtml = ([
  'html',
  'multipart',
  'attachment',
  'raw',
  'template',
] as MailPattern[]).includes(pattern)
  ? `<html lang="ja"><body><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(text).replaceAll('\n', '<br>')}</p></body></html>`
  : undefined;
const html = process.env.MAIL_HTML ?? generatedHtml;
const templateName = process.env.MAIL_TEMPLATE_NAME ?? 'ses-mail-catcher-sdk-example-template';

const isLocalEndpoint = (endpoint: string): boolean => {
  const url = new URL(endpoint);
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
};

const ses = new SESv2Client({
  endpoint: sesMailCatcherUrl,
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  ...(isLocalEndpoint(sesMailCatcherUrl)
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
        },
      }
    : {}),
});

const createTemplate = async (): Promise<void> => {
  const templateContent = {
    Subject: subject,
    Text: text,
    ...(html === undefined ? {} : { Html: html }),
  };
  try {
    await ses.send(new CreateEmailTemplateCommand({
      TemplateName: templateName,
      TemplateContent: templateContent,
    }));
  } catch (error: unknown) {
    if (
      error === null
      || typeof error !== 'object'
      || !('name' in error)
      || error.name !== 'AlreadyExistsException'
    ) {
      throw error;
    }
    await ses.send(new UpdateEmailTemplateCommand({
      TemplateName: templateName,
      TemplateContent: templateContent,
    }));
  }
};

const createRawMessage = (): Uint8Array => {
  const boundary = 'ses-mail-catcher-sdk-example-boundary';
  const headers = [
    `From: ${safeHeaderValue(from)}`,
    `To: ${to.map(safeHeaderValue).join(', ')}`,
    ...(cc === undefined ? [] : [`Cc: ${cc.map(safeHeaderValue).join(', ')}`]),
    ...(replyTo === undefined ? [] : [`Reply-To: ${replyTo.map(safeHeaderValue).join(', ')}`]),
    `Subject: ${encodeMimeHeader(safeHeaderValue(subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
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
    wrapBase64(html ?? ''),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(headers.join('\r\n'), 'utf8');
};

const createSimpleMessage = (): Message => {
  const body = pattern === 'html'
    ? { Html: { Data: html ?? '', Charset: 'UTF-8' } }
    : {
        Text: { Data: text, Charset: 'UTF-8' },
        ...(html === undefined ? {} : { Html: { Data: html, Charset: 'UTF-8' } }),
      };
  return {
    Subject: { Data: subject, Charset: 'UTF-8' },
    Body: body,
    Headers: [{ Name: 'X-Ses-Mail-Catcher-Pattern', Value: pattern }],
    ...(pattern === 'attachment'
      ? {
          Attachments: [{
            RawContent: Buffer.from(
              process.env.MAIL_ATTACHMENT_CONTENT ?? 'これは SDK サンプルからの添付ファイルです。📎\n',
              'utf8',
            ),
            FileName: process.env.MAIL_ATTACHMENT_FILENAME ?? 'example.txt',
            ContentType: process.env.MAIL_ATTACHMENT_CONTENT_TYPE ?? 'text/plain',
            ContentDisposition: 'ATTACHMENT' as const,
          }],
        }
      : {}),
  };
};

const createContent = (): EmailContent => {
  if (pattern === 'raw') {
    return { Raw: { Data: createRawMessage() } };
  }
  if (pattern === 'template') {
    return {
      Template: {
        TemplateName: templateName,
        TemplateData: process.env.MAIL_TEMPLATE_DATA ?? '{"name":"developer"}',
      },
    };
  }
  return { Simple: createSimpleMessage() };
};

if (pattern === 'template') {
  await createTemplate();
}

const response = await ses.send(new SendEmailCommand({
  FromEmailAddress: from,
  Destination: {
    ToAddresses: to,
    ...(cc === undefined ? {} : { CcAddresses: cc }),
    ...(bcc === undefined ? {} : { BccAddresses: bcc }),
  },
  ...(replyTo === undefined ? {} : { ReplyToAddresses: replyTo }),
  Content: createContent(),
}));

console.log(`mail catcher accepted ${pattern} message ${response.MessageId ?? '(no message id)'}`);
