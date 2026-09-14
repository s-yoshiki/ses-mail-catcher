import { describe, expect, it } from 'vitest';

import { rewriteCidReferences } from '../src/cid.js';
import type { MessageAttachment } from '../src/types.js';

const attachment = (overrides: Partial<MessageAttachment>): MessageAttachment => ({
  index: 0,
  filename: 'logo.png',
  contentType: 'image/png',
  size: 100,
  inline: true,
  ...overrides,
});

const urlFor = (index: number): string => `https://example.test/api/messages/m1/attachments/${index}`;

describe('rewriteCidReferences', () => {
  it('rewrites a src="cid:..." reference to the matching attachment URL', () => {
    const html = '<img src="cid:logo@example">';
    const result = rewriteCidReferences(html, [attachment({ contentId: '<logo@example>' })], urlFor);

    expect(result).toBe(`<img src="${urlFor(0)}">`);
  });

  it('rewrites a single-quoted background attribute', () => {
    const html = "<td background='cid:logo@example'></td>";
    const result = rewriteCidReferences(html, [attachment({ contentId: '<logo@example>' })], urlFor);

    expect(result).toBe(`<td background='${urlFor(0)}'></td>`);
  });

  it('rewrites cid: references inside a CSS url(), quoted or not', () => {
    const html = '<div style="background-image: url(cid:logo@example)"></div>'
      + '<div style=\'background: url("cid:logo@example")\'></div>';
    const result = rewriteCidReferences(html, [attachment({ contentId: '<logo@example>' })], urlFor);

    expect(result).toContain(`url(${urlFor(0)})`);
    expect(result).toContain(`url("${urlFor(0)}")`);
  });

  it('matches case-insensitively and regardless of angle brackets on either side', () => {
    const html = '<img src="cid:LOGO@example">';
    const result = rewriteCidReferences(html, [attachment({ contentId: 'logo@example' })], urlFor);

    expect(result).toBe(`<img src="${urlFor(0)}">`);
  });

  it('decodes a URL-encoded cid reference before comparing', () => {
    const html = '<img src="cid:logo%40example">';
    const result = rewriteCidReferences(html, [attachment({ contentId: '<logo@example>' })], urlFor);

    expect(result).toBe(`<img src="${urlFor(0)}">`);
  });

  it('leaves an unmatched cid: reference unchanged', () => {
    const html = '<img src="cid:does-not-exist">';
    const result = rewriteCidReferences(html, [attachment({ contentId: '<logo@example>' })], urlFor);

    expect(result).toBe(html);
  });

  it('leaves non-cid src attributes unchanged', () => {
    const html = '<img src="https://example.test/tracker.gif">';
    const result = rewriteCidReferences(html, [attachment({ contentId: '<logo@example>' })], urlFor);

    expect(result).toBe(html);
  });

  it('ignores attachments with no contentId and returns the input unchanged when none have one', () => {
    const html = '<img src="cid:logo@example">';
    const result = rewriteCidReferences(html, [attachment({ contentId: undefined })], urlFor);

    expect(result).toBe(html);
  });

  it('rewrites more than one reference to different attachments', () => {
    const html = '<img src="cid:one"><img src="cid:two">';
    const result = rewriteCidReferences(
      html,
      [attachment({ index: 0, contentId: '<one>' }), attachment({ index: 1, contentId: '<two>' })],
      urlFor,
    );

    expect(result).toBe(`<img src="${urlFor(0)}"><img src="${urlFor(1)}">`);
  });
});
