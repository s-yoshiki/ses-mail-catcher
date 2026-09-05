import { describe, expect, it } from 'vitest';

import { parseMessageContent, toContentResponse } from '../src/message-content.js';

const BOUNDARY = 'boundary-1';

function buildMultipart(): Uint8Array {
  const parts = [
    'From: sender@example.com',
    'To: recipient@example.com',
    'Subject: =?UTF-8?B?5rOo5paH56K66KqN?=',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${BOUNDARY}"`,
    '',
    `--${BOUNDARY}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('本文です', 'utf8').toString('base64'),
    `--${BOUNDARY}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<p>Hello =E2=98=85</p>',
    `--${BOUNDARY}`,
    'Content-Type: application/pdf; name="invoice.pdf"',
    'Content-Disposition: attachment; filename="invoice.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('%PDF-1.4', 'utf8').toString('base64'),
    `--${BOUNDARY}--`,
    '',
  ];
  return Buffer.from(parts.join('\r\n'), 'utf8');
}

describe('parseMessageContent', () => {
  it('decodes both body parts and lists attachments', async () => {
    const parsed = await parseMessageContent(buildMultipart());

    // multipart/mixed parts are concatenated into the text view by the parser,
    // so the plain part is contained rather than equal.
    expect(parsed.text).toContain('本文です');
    expect(parsed.html).toContain('Hello ★');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      index: 0,
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      inline: false,
    });
    expect(Buffer.from(parsed.attachments[0].content).toString('utf8')).toBe('%PDF-1.4');
  });

  it('handles a message with only a plain text body', async () => {
    const raw = Buffer.from(
      'From: a@example.com\r\nTo: b@example.com\r\nSubject: Plain\r\n\r\nJust text',
      'utf8',
    );
    const parsed = await parseMessageContent(raw);

    expect(parsed.text?.trim()).toBe('Just text');
    expect(parsed.html).toBeUndefined();
    expect(parsed.attachments).toEqual([]);
  });
});

describe('toContentResponse', () => {
  it('drops the attachment bytes from the JSON projection', async () => {
    const response = toContentResponse(await parseMessageContent(buildMultipart()));

    expect(response.attachments[0]).not.toHaveProperty('content');
    expect(response.attachments[0].size).toBe('%PDF-1.4'.length);
  });
});
