import { describe, expect, it } from 'vitest';

import { formatAddressList, formatSize, formatTimestamp, subjectLabel } from '../src/format.js';

describe('formatSize', () => {
  it('keeps bytes whole', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(999)).toBe('999 B');
  });

  it('steps up through the units', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1024 * 1024 * 3.5)).toBe('3.5 MB');
  });

  it('does not invent a size for invalid input', () => {
    expect(formatSize(Number.NaN)).toBe('-');
    expect(formatSize(-1)).toBe('-');
  });
});

describe('formatTimestamp', () => {
  it('returns the input when it is not a date', () => {
    expect(formatTimestamp('not a date')).toBe('not a date');
  });

  it('drops the date for messages received today', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const sameDay = formatTimestamp('2026-09-06T09:30:00Z', now);
    const otherDay = formatTimestamp('2026-09-05T09:30:00Z', now);
    expect(sameDay.length).toBeLessThan(otherDay.length);
  });
});

describe('formatAddressList', () => {
  it('joins addresses and marks an empty list', () => {
    expect(formatAddressList(['a@example.com', 'b@example.com'])).toBe('a@example.com, b@example.com');
    expect(formatAddressList([])).toBe('-');
  });
});

describe('subjectLabel', () => {
  it('labels blank subjects so the row stays clickable', () => {
    expect(subjectLabel('  ')).toBe('(no subject)');
    expect(subjectLabel(' Hello ')).toBe('Hello');
  });
});
