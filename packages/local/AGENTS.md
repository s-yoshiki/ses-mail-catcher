# Local package instructions

This package is an ESM Node.js application using the built-in `node:sqlite` module.

- Keep Node.js support at `>=22.5.0`.
- Keep relative imports explicit with `.js` suffixes.
- Keep the default SQLite path in the OS cache directory and support `SES_MAIL_CATCHER_DB_PATH` plus `--db-path` overrides.
- Test HTTP behavior through the SES v2 JSON protocol and test SQLite persistence with temporary databases.
- `Dockerfile` is the supported portable distribution path. `build:binary` uses `scriptc` only as an experimental, host-native option.
