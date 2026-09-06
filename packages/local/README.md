# ses-mail-catcher-local

Local Amazon SES v2-compatible mail catcher for development and integration tests.
Messages are stored in a SQLite database and can be inspected through a small HTTP API.

## Requirements

- Node.js 22.5 or later

The package is ESM (`type: module`) and uses NodeNext TypeScript resolution.

The local implementation uses the built-in `node:sqlite` module, so it does not require a native SQLite npm addon.

## Run locally

```sh
pnpm build
node packages/local/lib/cli.js
```

`pnpm build` is run from the repository root so the viewer bundle is built
before it is copied into `lib/viewer`. Building this package on its own leaves
the server working as a pure API.

The server listens on `http://127.0.0.1:8005` by default, and serves the
[viewer](../viewer) at `/`. The database is stored in the platform cache directory:

- macOS: `~/Library/Caches/ses-mail-catcher/mailbox.sqlite3`
- Linux: `$XDG_CACHE_HOME/ses-mail-catcher/mailbox.sqlite3` or `~/.cache/ses-mail-catcher/mailbox.sqlite3`
- Windows: `%LOCALAPPDATA%/ses-mail-catcher/mailbox.sqlite3`

Set `SES_MAIL_CATCHER_DB_PATH` or pass `--db-path` when a persistent, non-cache location is needed.

```sh
ses-mail-catcher --port 8005 --db-path ./tmp/mailbox.sqlite3
```

The listening address is configurable the same way. Command line flags win over
the environment.

| Setting | Environment variable | Flag | Default |
| --- | --- | --- | --- |
| Bind address | `SES_MAIL_CATCHER_HOST` | `--host` | `127.0.0.1` |
| Port | `SES_MAIL_CATCHER_PORT` | `--port` | `8005` |
| Database path | `SES_MAIL_CATCHER_DB_PATH` | `--db-path` | OS cache directory |

## Use with AWS SDK for JavaScript v3

Point the SES v2 client at the local endpoint and use dummy credentials:

```ts
const ses = new SESv2Client({
  endpoint: 'http://127.0.0.1:8005',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
```

The server accepts `SendEmail` with Simple or Raw content and `SendRawEmail` requests.
The request/inspection shape is inspired by [aws-ses-v2-local](https://github.com/domdomegg/aws-ses-v2-local), while the storage implementation here is SQLite-based.

## Inspect messages

`/api` is the contract the viewer is built against:

The shared TypeScript types and Zod schemas are maintained in
[`packages/api-contract/src/index.ts`](../api-contract/src/index.ts).

| Route | Response |
| --- | --- |
| `GET /api/messages?mailbox=&limit=` | `{ messages, mailboxes }` |
| `GET /api/messages/:id` | message with `content.text`, `content.html`, `content.attachments` |
| `GET /api/messages/:id/raw` | `message/rfc822` |
| `GET /api/messages/:id/attachments/:index` | the attachment bytes |
| `GET /api/health` | `{ status: 'ok' }` |

The original routes are kept as aliases:

- `GET /health-check`
- `GET /store`
- `GET /store/:id`
- `GET /store/:id/raw`

Message bodies are parsed on the server with
[postal-mime](https://github.com/postalsys/postal-mime), so clients get decoded
text, HTML and attachment metadata rather than raw MIME.

## Container

```sh
docker build -f packages/local/Dockerfile -t ses-mail-catcher-local .
docker run --rm -p 8005:8005 -v "$PWD/.ses-mail-catcher:/data" ses-mail-catcher-local
```

The build context is the repository root, because the image also builds the
viewer from `packages/viewer`.

The image sets `SES_MAIL_CATCHER_HOST=0.0.0.0`, because a server bound to the
container loopback interface is not reachable through a published port.

## Native binary

The repository provides a `scriptc` build command for an experimental native binary:

```sh
pnpm --filter ses-mail-catcher-local build:binary
```

The resulting binary is host-native. The Node.js CLI and container image are the supported distribution paths while native binary support is evaluated.
