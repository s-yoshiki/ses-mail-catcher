# Local package instructions

This package is an ESM Node.js application using the built-in `node:sqlite` module.

- Keep Node.js support at `>=22.5.0`.
- Keep relative imports explicit with `.js` suffixes.
- Keep the default SQLite path in the OS cache directory and support `SES_MAIL_CATCHER_DB_PATH` plus `--db-path` overrides.
- Keep the default bind address on loopback. `SES_MAIL_CATCHER_HOST` / `--host` is the documented way to widen it, and the container image relies on that variable.
- Test HTTP behavior through the SES v2 JSON protocol and test SQLite persistence with temporary databases.
- Serve the viewer bundle from `lib/viewer`, resolved from the module URL, and keep the server usable as a pure API when the bundle is absent.
- `/api` is the viewer contract and `/store` are compatibility aliases. Changing a response shape means changing `packages/viewer` too.
- `Dockerfile` builds from the repository root because the image also builds the viewer. `build:binary` uses `scriptc` only as an experimental, host-native option.
