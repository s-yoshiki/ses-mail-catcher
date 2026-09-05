import { describe, expect, it } from 'vitest';

import { DB_PATH_ENV, resolveDbPath } from '../src/db-path.js';

describe('resolveDbPath', () => {
  it('prefers an explicit path', () => {
    expect(resolveDbPath({ [DB_PATH_ENV]: '/tmp/custom.sqlite3' }, 'linux', '/home/tester')).toBe('/tmp/custom.sqlite3');
  });

  it('uses the macOS cache directory', () => {
    expect(resolveDbPath({}, 'darwin', '/Users/tester')).toBe(
      '/Users/tester/Library/Caches/ses-mail-catcher/mailbox.sqlite3',
    );
  });

  it('uses XDG_CACHE_HOME on Linux', () => {
    expect(resolveDbPath({ XDG_CACHE_HOME: '/var/cache/tester' }, 'linux', '/home/tester')).toBe(
      '/var/cache/tester/ses-mail-catcher/mailbox.sqlite3',
    );
  });
});
