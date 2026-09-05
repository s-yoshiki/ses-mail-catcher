# Architecture

`ses-mail-catcher` provides two adapters over the same mail-capture purpose:

```text
Application
   ├─ local SES v2 endpoint ──> packages/local ──> SQLite cache
   └─ SendMailEvent invoke ──> packages/cdk ──> Lambda ──> S3 + DynamoDB
                                                        └─> SES (RELAY only)
```

## CDK / AWS serverless

`@s-yoshiki/cdk-ses-mail-catcher` provisions the existing serverless design:

- Lambda runs `mail-handler.handler` from the compiled package asset.
- S3 stores canonical raw MIME.
- DynamoDB stores searchable message metadata and TTL information.
- CATCH mode grants S3/DynamoDB permissions only.
- RELAY mode grants SES send permissions and sends the canonical MIME through SES.
  The statement is narrowed to `relay.fromEmailAddressIdentityArn` (plus the
  configuration set ARN when one is configured) and only falls back to `*` when
  no identity ARN is given.
- The bucket the construct creates is emptied on stack deletion, so a mailbox
  that still holds captured messages does not block `cdk destroy`.

The Lambda asset path is derived from `import.meta.url`, so handler source is not embedded in a hard-coded inline string and the installed package remains relocatable.

## Local

`ses-mail-catcher-local` exposes a small SES v2-compatible JSON endpoint. It accepts `SendEmail` Simple/Raw content and `SendRawEmail`, then stores message metadata and raw MIME in SQLite.

The default database is intentionally placed in the platform cache directory. Use `SES_MAIL_CATCHER_DB_PATH` or `--db-path` for a durable project-specific location.

The bind address defaults to `127.0.0.1` and is overridden with `SES_MAIL_CATCHER_HOST` / `--host`; the port with `SES_MAIL_CATCHER_PORT` / `--port`. The container image sets the host to `0.0.0.0` so that a published port reaches the server.

The local store supports:

- `GET /health-check`
- `GET /store`
- `GET /store/:id`
- `GET /store/:id/raw`

The local server requires Node.js 22.5 or later for `node:sqlite` and has no native SQLite npm addon.

## Distribution

- CDK: npm package `@s-yoshiki/cdk-ses-mail-catcher`.
- Local: Docker image built from `packages/local/Dockerfile`.
- Native binary: `scriptc` is available through `build:binary` as an experimental host-native option; the Node.js CLI and container image are the supported baseline.
