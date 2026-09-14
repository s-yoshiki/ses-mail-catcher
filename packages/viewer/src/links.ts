const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'()]+/giu;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/u;

const stripTrailingPunctuation = (url: string): string => url.replace(TRAILING_PUNCTUATION, '');

const dedupe = (urls: readonly string[]): string[] => Array.from(new Set(urls));

/** Extracts unique `http:`/`https:` URLs from plain text via regex. */
export const extractLinksFromText = (text: string): string[] => {
  const matches = text.match(HTTP_URL_PATTERN) ?? [];
  return dedupe(matches.map((url) => stripTrailingPunctuation(url)));
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//iu.test(value.trim());

/**
 * Extracts unique `http:`/`https:` URLs from an HTML message part: every
 * `href` on an `<a>`/`<area>`, plus any bare URL in the body text (the same
 * regex `extractLinksFromText` uses). Other schemes (`javascript:`, `data:`,
 * `mailto:`, ...) are excluded.
 *
 * The HTML is parsed with `DOMParser` into a detached, inert document that
 * is never inserted into the page, so this never executes scripts or loads
 * resources from the untrusted message — it only reads attribute and text
 * values back out.
 */
export const extractLinksFromHtml = (html: string): string[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const hrefs = Array.from(doc.querySelectorAll('a[href], area[href]'))
    .map((element) => element.getAttribute('href') ?? '')
    .filter((href) => isHttpUrl(href));

  const bodyText = doc.body?.textContent ?? '';

  return dedupe([...hrefs, ...extractLinksFromText(bodyText)]);
};
