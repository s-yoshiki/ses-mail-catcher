const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

export const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${SIZE_UNITS[unit]}`;
};

export const formatTimestamp = (isoString: string, now = new Date()): string => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
};

export const formatAddressList = (addresses: string[]): string => {
  return addresses.length > 0 ? addresses.join(', ') : '-';
};

/**
 * A short, human-relative rendering of a timestamp ("just now", "5m ago",
 * "3d ago", falling back to a short date past a week). The absolute time
 * belongs in `title`/`<time dateTime>` alongside this, since relative text
 * alone is not enough context on its own.
 */
export const formatRelativeTime = (isoString: string, now = new Date()): string => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 5) {
    return 'just now';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Zero-padded 24-hour clock time, used for the toolbar's "Updated HH:MM:SS" label. */
export const formatClockTime = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

/**
 * Summarizes a recipient list for the compact message row: the first
 * address plus a `+N` count of the rest. `title` carries the full list for
 * a native tooltip, since the row itself only has room for one line.
 */
export const formatRecipientsSummary = (addresses: string[]): { label: string; title: string } => {
  if (addresses.length === 0) {
    return { label: '-', title: '-' };
  }

  const [first, ...rest] = addresses;
  const label = rest.length > 0 ? `${first} +${rest.length}` : (first ?? '-');
  return { label, title: addresses.join(', ') };
};

/**
 * Picks the label shown in the message list. Mail without a subject is common
 * enough in tests that an empty row would be hard to click.
 */
export const subjectLabel = (subject: string): string => {
  const trimmed = subject.trim();
  return trimmed.length > 0 ? trimmed : '(no subject)';
};
