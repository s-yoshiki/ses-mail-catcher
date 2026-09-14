export interface RawHeader {
  readonly name: string;
  readonly value: string;
}

const HEADER_BODY_SPLIT = /\r\n\r\n|\n\n/u;
const LINE_SPLIT = /\r\n|\n/u;

/** The header block: everything before the first blank line (the header/body separator). */
const headerBlockOf = (raw: string): string => {
  const match = HEADER_BODY_SPLIT.exec(raw);
  return match === null ? raw : raw.slice(0, match.index);
};

/**
 * Unfolds RFC 5322 continuation lines (a line starting with a space or tab
 * continues the previous header) into one line per header, joined with a
 * single space.
 */
const unfoldLines = (headerBlock: string): string[] => {
  const lines: string[] = [];
  for (const line of headerBlock.split(LINE_SPLIT)) {
    if (line.length === 0) {
      continue;
    }
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] = `${lines.at(-1)} ${line.trim()}`;
    } else {
      lines.push(line);
    }
  }
  return lines;
};

const ENCODED_WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/gu;
/** Whitespace directly between two encoded-words is part of the encoding, not the decoded text (RFC 2047). */
const GAP_BETWEEN_ENCODED_WORDS = /(\?=)[ \t]+(=\?)/gu;

const base64ToBytes = (text: string): Uint8Array => {
  const binary = atob(text.replaceAll(/\s+/gu, ''));
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
};

/** `Q` encoding: `_` is a space, `=XX` is a hex-escaped byte, everything else is literal. */
const quotedPrintableToBytes = (text: string): Uint8Array => {
  const withSpaces = text.replaceAll('_', ' ');
  const bytes: number[] = [];
  for (let i = 0; i < withSpaces.length; i += 1) {
    const char = withSpaces[i];
    if (char === '=' && i + 2 < withSpaces.length) {
      const hex = withSpaces.slice(i + 1, i + 3);
      const value = Number.parseInt(hex, 16);
      if (!Number.isNaN(value)) {
        bytes.push(value);
        i += 2;
        continue;
      }
    }
    bytes.push(char?.codePointAt(0) ?? 0);
  }
  return Uint8Array.from(bytes);
};

/**
 * Decodes RFC 2047 encoded-words (`=?charset?B?...?=` / `=?charset?Q?...?=`)
 * for display. Falls back to the original text for a word that fails to
 * decode (an unknown charset, or malformed base64/quoted-printable), so a
 * decoding problem never hides the rest of the header value.
 */
export const decodeEncodedWords = (input: string): string => {
  const collapsed = input.replace(GAP_BETWEEN_ENCODED_WORDS, '$1$2');

  return collapsed.replace(ENCODED_WORD, (match: string, charset: string, encoding: string, text: string) => {
    try {
      const bytes = encoding.toLowerCase() === 'b' ? base64ToBytes(text) : quotedPrintableToBytes(text);
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return match;
    }
  });
};

const parseHeaderLine = (line: string): RawHeader | undefined => {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    return undefined;
  }
  const name = line.slice(0, colonIndex).trim();
  if (name.length === 0) {
    return undefined;
  }
  const value = line.slice(colonIndex + 1).trim();
  return { name, value: decodeEncodedWords(value) };
};

/**
 * Parses the header block of a raw `message/rfc822` source: splits it at
 * the first blank line, unfolds continuation lines, and decodes RFC 2047
 * encoded-words in each value for display. The `Source` view shows the raw
 * text unmodified alongside this.
 */
export const parseRawHeaders = (raw: string): RawHeader[] => {
  return unfoldLines(headerBlockOf(raw))
    .map((line) => parseHeaderLine(line))
    .filter((header): header is RawHeader => header !== undefined);
};
