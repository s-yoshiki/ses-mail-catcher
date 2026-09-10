# Architecture

`ses-mail-catcher` provides two adapters over the same mail-capture purpose:

```text
Application
   ├─ local SES v2 endpoint ──> packages/local ──> SQLite cache
   │                                  └─ serves packages/viewer at /
   └─ SendMailEvent invoke ──> packages/cdk ──> Lambda ──> S3 + DynamoDB
                                       │                └─> SES (RELAY only)
                                       └─ viewer function URL ──> serves
                                          packages/viewer over the same data
```

## CDK / AWS serverless

`@s-yoshiki/cdk-ses-mail-catcher` provisions the existing serverless design:

- The `@ses-mail-catcher/cdk-mail-handler` and `@ses-mail-catcher/cdk-viewer-handler` workspaces build
  `mail-handler.handler` and `viewer-handler.handler`; the CDK package copies
  them into separate directories in its published asset.
- S3 stores canonical raw MIME.
- DynamoDB stores searchable message metadata and TTL information.
- CATCH mode grants S3/DynamoDB permissions only.
- RELAY mode grants SES send permissions and sends the canonical MIME through SES.
  The statement is narrowed to `relay.fromEmailAddressIdentityArn` (plus the
  configuration set ARN when one is configured) and only falls back to `*` when
  no identity ARN is given.
- The bucket the construct creates is emptied on stack deletion, so captured
  messages do not block `cdk destroy`.

The Lambda asset path is derived from `import.meta.url`, so handler source is not embedded in a hard-coded inline string and the installed package remains relocatable.

## Local

`@ses-mail-catcher/local` exposes a small SES v2-compatible JSON endpoint. It accepts `SendEmail` Simple/Raw content and `SendRawEmail`, then stores message metadata and raw MIME in SQLite.

The default database is intentionally placed in the platform cache directory. Use `SES_MAIL_CATCHER_DB_PATH` or `--db-path` for a durable project-specific location.

The bind address defaults to `127.0.0.1` and is overridden with `SES_MAIL_CATCHER_HOST` / `--host`; the port with `SES_MAIL_CATCHER_PORT` / `--port`. The container image sets the host to `0.0.0.0` so that a published port reaches the server.

The local store answers the viewer contract under `/api`:

- `GET /api/messages`
- `GET /api/messages/:id`
- `GET /api/messages/:id/raw`
- `GET /api/messages/:id/attachments/:index`
- `GET /api/health`

The original `/health-check`, `/store`, `/store/:id` and `/store/:id/raw` routes
remain as aliases.

The local server requires Node.js 22.5 or later for `node:sqlite` and has no native SQLite npm addon.

## Viewer

`@ses-mail-catcher/viewer` is a React single page app built with Vite. It is not
published on its own: `packages/local` copies the bundle into `lib/viewer` at
build time and serves it from the same port as the API, so no CORS handling and
no second process are involved.

The bundle is deliberately backend-agnostic. It uses relative asset URLs and
resolves its API root from the document, so any host that answers the `/api`
contract in `packages/api-contract/src/index.ts` can serve it. Message HTML is
rendered inside an iframe with an empty `sandbox` attribute, because captured
mail is untrusted input.

The viewer, local server and CDK viewer share the API's TypeScript contract
from `packages/api-contract`. The viewer validates JSON responses with the
contract's Zod schemas at its HTTP boundary; server-side code uses type-only
imports so the CDK Lambda asset remains free of workspace runtime dependencies.

Two backends serve it today:

- `packages/local` over SQLite, from its own HTTP server.
- `packages/cdk` over DynamoDB and S3, from an optional Lambda function URL.

The CDK viewer is opt-in and refuses to exist without access control. Basic
authentication reads its credentials from Secrets Manager at run time, so they
stay out of the template, and the address allow list matches the function URL
request context rather than a forwarded header. Both are enforced inside the
function, because a function URL a browser can open is unauthenticated at the
AWS layer.

The Lambda asset is the compiled `lib` directory and carries no `node_modules`.
The build copies the viewer bundle into `viewer-handler/lib/viewer` and vendors
the MIME parser into `viewer-handler/lib/vendor` before packaging both handler
workspaces into the CDK asset.

## Distribution

- CDK: npm package `@s-yoshiki/cdk-ses-mail-catcher`.
- Local: Docker image built from `packages/local/Dockerfile`.
- Native binary: `scriptc` is available through `build:binary` as an experimental host-native option; the Node.js CLI and container image are the supported baseline.
