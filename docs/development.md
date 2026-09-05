# Development guide

## Prerequisites

- Node.js 24 (see `.node-version`).
- pnpm 11.25.0.

The repository is ESM-first. TypeScript uses NodeNext resolution and relative imports include their emitted `.js` suffix.

## Install and verify

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For the CDK package, `compile` additionally runs jsii:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher compile
```

For the local package:

```sh
pnpm --filter ses-mail-catcher-local build
pnpm --filter ses-mail-catcher-local test
```

## Local SES endpoint

```sh
node packages/local/lib/cli.js --port 8005
```

Use dummy credentials when configuring an AWS SDK client:

```ts
const ses = new SESv2Client({
  endpoint: 'http://127.0.0.1:8005',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
```

The database location is printed at startup. It defaults to the operating system cache directory; set `SES_MAIL_CATCHER_DB_PATH` or `--db-path` to override it.

The server binds to `127.0.0.1:8005` by default. Use `SES_MAIL_CATCHER_HOST` / `--host` and `SES_MAIL_CATCHER_PORT` / `--port` to change that; flags take precedence over the environment.
