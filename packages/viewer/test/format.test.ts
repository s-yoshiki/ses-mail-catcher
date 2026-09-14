import { describe, expect, it } from 'vitest';

import {
  formatAddressList,
  formatClockTime,
  formatRecipientsSummary,
  formatRelativeTime,
  formatSize,
  formatTimestamp,
  subjectLabel,
} from '../src/format.js';

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

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-06T12:00:00Z');

  it('describes very recent times as "just now"', () => {
    expect(formatRelativeTime('2026-09-06T11:59:58Z', now)).toBe('just now');
  });

  it('steps through seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime('2026-09-06T11:59:30Z', now)).toBe('30s ago');
    expect(formatRelativeTime('2026-09-06T11:45:00Z', now)).toBe('15m ago');
    expect(formatRelativeTime('2026-09-06T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-09-04T12:00:00Z', now)).toBe('2d ago');
  });

  it('falls back to a short date once a week has passed', () => {
    expect(formatRelativeTime('2026-08-20T12:00:00Z', now)).not.toContain('ago');
  });

  it('clamps a future timestamp to "just now" instead of a negative duration', () => {
    expect(formatRelativeTime('2026-09-06T12:05:00Z', now)).toBe('just now');
  });

  it('returns the input when it is not a date', () => {
    expect(formatRelativeTime('not a date')).toBe('not a date');
  });
});

const pad2 = (value: number): string => String(value).padStart(2, '0');

describe('formatClockTime', () => {
  it('zero-pads hours, minutes and seconds to a 24-hour clock', () => {
    const date = new Date('2026-09-06T00:00:00.000Z');
    date.setHours(4, 5, 9, 0);
    expect(formatClockTime(date.getTime())).toBe(`${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`);
  });
});

describe('formatRecipientsSummary', () => {
  it('shows the only address without a count', () => {
    expect(formatRecipientsSummary(['a@example.com'])).toEqual({ label: 'a@example.com', title: 'a@example.com' });
  });

  it('shows the first address plus a count of the rest, and the full list in the title', () => {
    expect(formatRecipientsSummary(['a@example.com', 'b@example.com', 'c@example.com'])).toEqual({
      label: 'a@example.com +2',
      title: 'a@example.com, b@example.com, c@example.com',
    });
  });

  it('marks an empty list', () => {
    expect(formatRecipientsSummary([])).toEqual({ label: '-', title: '-' });
  });
});
