import type { MessageDetail } from '../types.js';

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
    mailbox: 'default',
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
    mailbox: 'orders',
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
};

export const mockAttachmentBodies: Record<string, string> = {
  'mock-orders/0': 'Receipt for order #1042\n',
};
