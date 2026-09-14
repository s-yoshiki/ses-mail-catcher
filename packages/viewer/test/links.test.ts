import { describe, expect, it } from 'vitest';

import { extractLinksFromText } from '../src/links.js';

describe('extractLinksFromText', () => {
  it('extracts http and https URLs from plain text', () => {
    const text = 'See https://example.test/report and http://example.test/data for details.';

    expect(extractLinksFromText(text)).toEqual([
      'https://example.test/report',
      'http://example.test/data',
    ]);
  });

  it('deduplicates repeated URLs', () => {
    const text = 'https://example.test/a is the same as https://example.test/a';

    expect(extractLinksFromText(text)).toEqual(['https://example.test/a']);
  });

  it('strips trailing sentence punctuation from a matched URL', () => {
    const text = 'Visit https://example.test/path, then https://example.test/other.';

    expect(extractLinksFromText(text)).toEqual([
      'https://example.test/path',
      'https://example.test/other',
    ]);
  });

  it('ignores non-http(s) schemes', () => {
    const text = 'mailto:someone@example.test and javascript:alert(1) and data:text/plain;base64,aGVsbG8=';

    expect(extractLinksFromText(text)).toEqual([]);
  });

  it('returns an empty array when there are no URLs', () => {
    expect(extractLinksFromText('No links here.')).toEqual([]);
  });

  it('keeps a query string and fragment intact', () => {
    const text = 'Track it at https://example.test/path?x=1&y=2#section';

    expect(extractLinksFromText(text)).toEqual(['https://example.test/path?x=1&y=2#section']);
  });
});
