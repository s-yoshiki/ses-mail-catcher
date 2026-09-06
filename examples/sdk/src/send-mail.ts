import { CreateEmailTemplateCommand, SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const splitAddresses = (value: string): string[] => {
  const addresses = value
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  if (addresses.length === 0) {
    throw new Error('MAIL_TO must contain at least one address');
  }
  return addresses;
};

const sesMailCatcherUrl = process.env.SES_MAIL_CATCHER_URL ?? 'http://127.0.0.1:8005';
const from = process.env.MAIL_FROM ?? 'noreply@example.com';
const to = splitAddresses(process.env.MAIL_TO ?? 'developer@example.com');
const subject = process.env.MAIL_SUBJECT ?? 'ses-mail-catcher SDK example';
const text = process.env.MAIL_TEXT ?? 'This message was sent with AWS SDK for JavaScript v3.';
const html = process.env.MAIL_HTML;
const mailbox = process.env.MAILBOX;

const ses = new SESv2Client({
  endpoint: sesMailCatcherUrl,
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
  },
});

const templateName = process.env.MAIL_TEMPLATE_NAME;
if (templateName !== undefined) {
  await ses.send(new CreateEmailTemplateCommand({
    TemplateName: templateName,
    TemplateContent: {
      Subject: subject,
      Text: text,
      ...(html === undefined ? {} : { Html: html }),
    },
  }));
}

const response = await ses.send(new SendEmailCommand({
  FromEmailAddress: from,
  Destination: { ToAddresses: to },
  Content: {
    Simple: {
      Subject: { Data: subject },
      Body: {
        Text: { Data: text },
        ...(html === undefined ? {} : { Html: { Data: html } }),
      },
    },
  },
  ...(mailbox === undefined ? {} : { EmailTags: [{ Name: 'mailbox', Value: mailbox }] }),
}));

console.log(`mail catcher accepted message ${response.MessageId ?? '(no message id)'}`);
