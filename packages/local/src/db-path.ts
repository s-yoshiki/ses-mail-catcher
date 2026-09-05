import { homedir } from 'node:os';
import { join } from 'node:path';

export const DB_PATH_ENV = 'SES_MAIL_CATCHER_DB_PATH';

export function resolveDbPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  const explicitPath = env[DB_PATH_ENV];
  if (explicitPath) {
    return explicitPath;
  }

  if (platform === 'darwin') {
    return join(home, 'Library', 'Caches', 'ses-mail-catcher', 'mailbox.sqlite3');
  }

  if (platform === 'win32') {
    return join(
      env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'),
      'ses-mail-catcher',
      'mailbox.sqlite3',
    );
  }

  return join(
    env.XDG_CACHE_HOME ?? join(home, '.cache'),
    'ses-mail-catcher',
    'mailbox.sqlite3',
  );
}
