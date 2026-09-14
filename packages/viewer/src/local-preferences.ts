/**
 * Small helpers for a `localStorage`-backed preference (the preview width
 * toggle, the raw source wrap toggle, ...), each wrapped in try/catch since
 * `localStorage` can throw (private browsing, disabled storage, a full
 * quota) and a missing preference must never break the app. Mirrors the
 * pattern already used for the auto-refresh toggle in `queries.ts`.
 */
export const readStoredBoolean = (key: string, defaultValue: boolean): boolean => {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  } catch {
    return defaultValue;
  }
};

export const writeStoredBoolean = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; the preference still works for the rest of the session.
  }
};

/** Reads a persisted value constrained to one of `allowed`, falling back to `defaultValue` for anything else (including a missing or corrupted entry). */
export const readStoredEnum = <T extends string>(key: string, allowed: readonly T[], defaultValue: T): T => {
  try {
    const stored = window.localStorage.getItem(key);
    return stored !== null && (allowed as readonly string[]).includes(stored) ? (stored as T) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const writeStoredString = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the preference still works for the rest of the session.
  }
};
