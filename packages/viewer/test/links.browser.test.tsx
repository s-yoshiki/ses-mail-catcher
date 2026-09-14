import { describe, expect, it } from 'vitest';

import { extractLinksFromHtml } from '../src/links.js';

// `extractLinksFromHtml` parses with `DOMParser`, which only exists in a
// browser environment — the `unit` Vitest project (Node, no DOM) covers
// `extractLinksFromText` instead (see `test/links.test.ts`).
describe('extractLinksFromHtml', () => {
  it('extracts href values from anchor and area tags', () => {
    const html = '<a href="https://example.test/a">A</a>'
      + '<map><area href="http://example.test/b" shape="rect" coords="0,0,1,1" alt="B"></map>';

    expect(extractLinksFromHtml(html)).toEqual(['https://example.test/a', 'http://example.test/b']);
  });

  it('excludes non-http(s) schemes', () => {
    const html = '<a href="mailto:someone@example.test">Mail</a>'
      + '<a href="javascript:alert(1)">JS</a>'
      + '<a href="data:text/plain;base64,aGVsbG8=">Data</a>';

    expect(extractLinksFromHtml(html)).toEqual([]);
  });

  it('also finds a bare URL mentioned in the body text', () => {
    const html = '<p>See https://example.test/report for details.</p>';

    expect(extractLinksFromHtml(html)).toEqual(['https://example.test/report']);
  });

  it('deduplicates a URL that appears both as an href and as visible text', () => {
    const html = '<p>Visit <a href="https://example.test/a">https://example.test/a</a></p>';

    expect(extractLinksFromHtml(html)).toEqual(['https://example.test/a']);
  });

  it('parses into a detached document that is never inserted into the page', () => {
    extractLinksFromHtml('<a href="https://example.test/never-inserted">A</a>');

    expect(document.querySelector('a[href="https://example.test/never-inserted"]')).toBeNull();
  });

  it('returns an empty array for HTML with no links', () => {
    expect(extractLinksFromHtml('<p>No links here.</p>')).toEqual([]);
  });
});
