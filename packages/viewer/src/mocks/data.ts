import type { MessageDetail } from '../types.js';

/**
 * A 1x1 transparent PNG, used as the inline image body for the mock message
 * that references an attachment via `cid:`.
 */
const INLINE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export const inlinePngBytes = (): Uint8Array => {
  return Uint8Array.from(atob(INLINE_PNG_BASE64), (char) => char.codePointAt(0) ?? 0);
};

const LONG_SUBJECT = 'Quarterly infrastructure spend review, action items, and the follow-up schedule '
  + 'for every regional team ahead of next week’s all-hands so nobody is caught off guard by the numbers';

export const mockMessages: MessageDetail[] = [
  {
    id: 'mock-welcome',
    fromAddress: 'hello@example.test',
    toAddresses: ['you@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: 'Welcome to ses-mail-catcher',
    receivedAt: '2026-09-06T00:00:00.000Z',
    size: 1420,
    content: {
      text: 'This is a sample message from the MSW browser mock.',
      html: '<!doctype html><html><body><h1>Welcome</h1><p>This message is served by MSW.</p></body></html>',
      attachments: [],
    },
  },
  {
    id: 'mock-orders',
    fromAddress: 'orders@example.test',
    toAddresses: ['shop@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: ['support@example.test'],
    subject: 'Order confirmation #1042',
    receivedAt: '2026-09-05T15:30:00.000Z',
    size: 3840,
    content: {
      text: 'Thanks for your order. The receipt is attached.',
      attachments: [
        {
          index: 0,
          filename: 'receipt.txt',
          contentType: 'text/plain',
          size: 28,
          inline: false,
        },
      ],
    },
  },
  {
    id: 'mock-newsletter',
    fromAddress: 'news@example.test',
    toAddresses: [
      'alice@example.test',
      'bob@example.test',
      'carol@example.test',
      'dave@example.test',
      'erin@example.test',
    ],
    ccAddresses: ['manager@example.test', 'archive@example.test'],
    bccAddresses: [],
    replyToAddresses: [],
    subject: 'Weekly digest',
    receivedAt: '2026-09-05T12:00:00.000Z',
    size: 2200,
    content: {
      text: 'This week: five updates from the team.',
      html: '<!doctype html><html><body><h1>Weekly digest</h1><p>Five updates from the team.</p></body></html>',
      attachments: [],
    },
  },
  {
    id: 'mock-blank-subject',
    fromAddress: 'system@example.test',
    toAddresses: ['ops@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: '',
    receivedAt: '2026-09-05T09:00:00.000Z',
    size: 512,
    content: {
      text: 'Automated notice with no subject line.',
      attachments: [],
    },
  },
  {
    id: 'mock-text-only',
    fromAddress: 'alerts@example.test',
    toAddresses: ['oncall@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: 'Disk usage warning',
    receivedAt: '2026-09-05T06:00:00.000Z',
    size: 640,
    content: {
      text: 'Disk usage on db-1 crossed 90%.',
      attachments: [],
    },
  },
  {
    id: 'mock-html-only',
    fromAddress: 'marketing@example.test',
    toAddresses: ['lead@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: 'New feature announcement',
    receivedAt: '2026-09-05T03:00:00.000Z',
    size: 1800,
    content: {
      // Two distinct links (an `<a href>` and a bare URL in the text) for
      // the Links tab's extraction — see `src/links.ts`.
      html: '<!doctype html><html><body><h1>New feature announcement</h1>'
        + '<p>HTML-only campaign email. Read the <a href="https://example.test/changelog">changelog</a>.</p>'
        + '<p>Docs: http://example.test/docs. </p>'
        + '<p><a href="mailto:sales@example.test">Contact sales</a></p>'
        + '</body></html>',
      attachments: [],
    },
  },
  {
    id: 'mock-inline-image',
    fromAddress: 'design@example.test',
    toAddresses: ['reviewer@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: 'Logo preview',
    receivedAt: '2026-09-04T18:00:00.000Z',
    size: 4096,
    content: {
      text: 'Logo preview attached inline. Review notes are attached separately.',
      html: '<!doctype html><html><body><p>Here is the logo:</p><img src="cid:logo-image" alt="Logo" /></body></html>',
      attachments: [
        {
          index: 0,
          filename: 'logo.png',
          contentType: 'image/png',
          size: inlinePngBytes().length,
          // Real backends (via postal-mime) report `contentId` with
          // surrounding angle brackets, while the HTML references it as
          // `cid:logo-image` with none — see `rewriteCidReferences` in
          // `src/cid.ts`, which normalizes both before comparing.
          contentId: '<logo-image>',
          inline: true,
        },
        {
          index: 1,
          filename: 'notes.txt',
          contentType: 'text/plain',
          size: 24,
          inline: false,
        },
      ],
    },
  },
  {
    id: 'mock-japanese',
    fromAddress: 'info@example.test',
    toAddresses: ['user@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: 'ご注文ありがとうございます',
    receivedAt: '2026-09-04T12:00:00.000Z',
    size: 980,
    content: {
      text: 'ご注文を承りました。発送まで今しばらくお待ちください。',
      html: '<!doctype html><html><body><h1>ご注文ありがとうございます</h1><p>発送まで今しばらくお待ちください。</p></body></html>',
      attachments: [],
    },
  },
  {
    id: 'mock-long-subject',
    fromAddress: 'reports@example.test',
    toAddresses: ['finance@example.test'],
    ccAddresses: [],
    bccAddresses: [],
    replyToAddresses: [],
    subject: LONG_SUBJECT,
    receivedAt: '2026-09-04T06:00:00.000Z',
    size: 1300,
    content: {
      text: 'See the attached quarterly report summary.',
      attachments: [],
    },
  },
];

export const mockRawMessages: Record<string, string> = {
  'mock-welcome': [
    'From: hello@example.test',
    'To: you@example.test',
    'Subject: Welcome to ses-mail-catcher',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'This is a sample message from the MSW browser mock.',
  ].join('\r\n'),
  'mock-orders': [
    'From: orders@example.test',
    'To: shop@example.test',
    'Subject: Order confirmation #1042',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Thanks for your order. The receipt is attached.',
  ].join('\r\n'),
  'mock-newsletter': [
    'From: news@example.test',
    'To: alice@example.test, bob@example.test, carol@example.test, dave@example.test, erin@example.test',
    'Cc: manager@example.test, archive@example.test',
    'Subject: Weekly digest',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'This week: five updates from the team.',
  ].join('\r\n'),
  'mock-blank-subject': [
    'From: system@example.test',
    'To: ops@example.test',
    'Subject:',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Automated notice with no subject line.',
  ].join('\r\n'),
  'mock-text-only': [
    'From: alerts@example.test',
    'To: oncall@example.test',
    'Subject: Disk usage warning',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Disk usage on db-1 crossed 90%.',
  ].join('\r\n'),
  'mock-html-only': [
    'From: marketing@example.test',
    'To: lead@example.test',
    'Subject: New feature announcement',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<!doctype html><html><body><h1>New feature announcement</h1><p>HTML-only campaign email.</p></body></html>',
  ].join('\r\n'),
  'mock-inline-image': [
    'From: design@example.test',
    'To: reviewer@example.test',
    'Subject: Logo preview',
    'Content-Type: multipart/related; boundary="mock-boundary"',
    '',
    'This is a MIME-encoded message with an inline image referenced by Content-ID <logo-image>.',
  ].join('\r\n'),
  'mock-japanese': [
    'From: info@example.test',
    'To: user@example.test',
    'Subject: =?UTF-8?B?44GU5rOo5paH44GC44KK44GM44Go44GG44GU44GW44GE44G+44GZ?=',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'ご注文を承りました。発送まで今しばらくお待ちください。',
  ].join('\r\n'),
  'mock-long-subject': [
    'From: reports@example.test',
    'To: finance@example.test',
    `Subject: ${LONG_SUBJECT}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'See the attached quarterly report summary.',
  ].join('\r\n'),
};

export type AttachmentBody = string | Uint8Array;

export const mockAttachmentBodies: Record<string, AttachmentBody> = {
  'mock-orders/0': 'Receipt for order #1042\n',
  'mock-inline-image/0': inlinePngBytes(),
  'mock-inline-image/1': 'Reviewer notes go here.',
};
