const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatSize(bytes: number): string {
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
}

export function formatTimestamp(isoString: string, now = new Date()): string {
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
}

export function formatAddressList(addresses: string[]): string {
  return addresses.length > 0 ? addresses.join(', ') : '-';
}

/**
 * Picks the label shown in the message list. Mail without a subject is common
 * enough in tests that an empty row would be hard to click.
 */
export function subjectLabel(subject: string): string {
  const trimmed = subject.trim();
  return trimmed.length > 0 ? trimmed : '(no subject)';
}
