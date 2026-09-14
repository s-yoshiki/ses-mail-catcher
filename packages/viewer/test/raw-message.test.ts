import { describe, expect, it } from 'vitest';

import { decodeEncodedWords, parseRawHeaders } from '../src/raw-message.js';

describe('parseRawHeaders', () => {
  it('parses simple headers up to the first blank line', () => {
    const raw = [
      'From: hello@example.test',
      'To: you@example.test',
      'Subject: Welcome',
      '',
      'This is the body.',
    ].join('\r\n');

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'From', value: 'hello@example.test' },
      { name: 'To', value: 'you@example.test' },
      { name: 'Subject', value: 'Welcome' },
    ]);
  });

  it('unfolds a continuation line into the previous header, joined with a single space', () => {
    const raw = [
      'From: hello@example.test',
      'Subject: A very long subject that',
      ' continues on the next line',
      '\tand a second continuation',
      '',
      'Body.',
    ].join('\r\n');

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'From', value: 'hello@example.test' },
      { name: 'Subject', value: 'A very long subject that continues on the next line and a second continuation' },
    ]);
  });

  it('decodes a base64 (B) RFC 2047 Japanese subject', () => {
    const raw = [
      'From: info@example.test',
      'Subject: =?UTF-8?B?44GU5rOo5paH44GC44KK44GM44Go44GG44GU44GW44GE44G+44GZ?=',
      '',
      'Body.',
    ].join('\r\n');

    const headers = parseRawHeaders(raw);
    expect(headers.find((header) => header.name === 'Subject')?.value).toBe('ご注文ありがとうございます');
  });

  it('decodes a quoted-printable (Q) RFC 2047 header, including underscore-as-space', () => {
    const raw = 'Subject: =?UTF-8?Q?Hello_=E2=80=93_world?=\r\n\r\nBody.';

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'Subject', value: 'Hello – world' },
    ]);
  });

  it('joins adjacent encoded-words without the whitespace between them, per RFC 2047', () => {
    const raw = 'Subject: =?UTF-8?B?44GU?= =?UTF-8?B?5rOo5paH?=\r\n\r\nBody.';

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'Subject', value: 'ご注文' },
    ]);
  });

  it('falls back to the original text for a malformed encoded-word', () => {
    const raw = 'Subject: =?not-a-real-charset?B?abc?=\r\n\r\nBody.';

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'Subject', value: '=?not-a-real-charset?B?abc?=' },
    ]);
  });

  it('handles a message with no blank line (headers only, or a malformed message)', () => {
    const raw = 'From: hello@example.test\r\nSubject: No body';

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'From', value: 'hello@example.test' },
      { name: 'Subject', value: 'No body' },
    ]);
  });

  it('skips a line with no colon instead of throwing', () => {
    const raw = 'not a header line\r\nFrom: hello@example.test\r\n\r\nBody.';

    expect(parseRawHeaders(raw)).toEqual([
      { name: 'From', value: 'hello@example.test' },
    ]);
  });
});

describe('decodeEncodedWords', () => {
  it('leaves plain text without encoded-words unchanged', () => {
    expect(decodeEncodedWords('Order confirmation #1042')).toBe('Order confirmation #1042');
  });
});
