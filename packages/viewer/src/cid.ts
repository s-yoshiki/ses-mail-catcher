import type { MessageAttachment } from './types.js';

/**
 * Normalizes a `Content-ID` value for comparison: strips surrounding angle
 * brackets (real backends report `contentId` as `"<logo@example>"`, matching
 * `postal-mime`'s own format, while the HTML references it as
 * `cid:logo@example`, with no brackets), URL-decodes it (a `cid:` reference
 * can itself be percent-encoded), and lower-cases it.
 */
const normalizeContentId = (value: string): string => {
  const trimmed = value.trim();
  const stripped = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed;
  let decoded = stripped;
  try {
    decoded = decodeURIComponent(stripped);
  } catch {
    // Not valid percent-encoding; compare the raw value instead.
  }
  return decoded.toLowerCase();
};

const CID_PREFIX = 'cid:';

/** Matches `src="..."` / `src='...'` / `background="..."` / `background='...'` attributes, case-insensitively. */
const CID_ATTRIBUTE_PATTERN = /\b(src|background)(\s*=\s*)(["'])([^"']*)\3/giu;

/** Matches CSS `url(...)`, with or without quotes. */
const CID_CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]*)\1\s*\)/giu;

/**
 * Replaces `cid:` references in `src`/`background` attributes and CSS
 * `url(...)` with the matching attachment's URL, so inline images render in
 * the sandboxed preview instead of showing as broken images. A reference
 * that does not match any attachment's `contentId` is left unchanged.
 *
 * Pure string rewriting (no DOM parsing), so it works the same way in the
 * `unit` Vitest project (Node, no DOM) as it does applied to the iframe
 * `srcDoc` in the browser.
 */
export const rewriteCidReferences = (
  html: string,
  attachments: readonly MessageAttachment[],
  urlFor: (index: number) => string,
): string => {
  const urlByContentId = new Map<string, string>();
  for (const attachment of attachments) {
    if (attachment.contentId === undefined) {
      continue;
    }
    urlByContentId.set(normalizeContentId(attachment.contentId), urlFor(attachment.index));
  }

  if (urlByContentId.size === 0) {
    return html;
  }

  const resolve = (rawValue: string): string | undefined => {
    if (!rawValue.toLowerCase().startsWith(CID_PREFIX)) {
      return undefined;
    }
    return urlByContentId.get(normalizeContentId(rawValue.slice(CID_PREFIX.length)));
  };

  const withAttributesRewritten = html.replace(
    CID_ATTRIBUTE_PATTERN,
    (match: string, attr: string, eq: string, quote: string, value: string) => {
      const resolved = resolve(value);
      return resolved === undefined ? match : `${attr}${eq}${quote}${resolved}${quote}`;
    },
  );

  return withAttributesRewritten.replace(
    CID_CSS_URL_PATTERN,
    (match: string, quote: string, value: string) => {
      const resolved = resolve(value);
      return resolved === undefined ? match : `url(${quote}${resolved}${quote})`;
    },
  );
};
