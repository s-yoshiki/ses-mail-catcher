# ses-mail-catcher

[日本語](./README_ja.md)

Capture emails sent through Amazon SES locally or on AWS, depending on your
development and deployment needs.

This repository is an ESM-first Node.js and TypeScript monorepo. The
development baseline is Node.js 24 and pnpm 11.25.0.

| Package | Purpose | Storage or runtime |
| --- | --- | --- |
| [`@s-yoshiki/cdk-ses-mail-catcher`](./packages/cdk) | AWS Serverless CDK construct for capturing SES SDK requests | API Gateway + Lambda + S3 + DynamoDB |
| [`@ses-mail-catcher/local`](./packages/local) | Local SES v2-compatible server for development and integration tests | Private workspace, distributed through Docker |
| [`@ses-mail-catcher/viewer`](./packages/viewer) | React viewer for captured messages | Private workspace, bundled into the local server and AWS `web-viewer` |
| [`@ses-mail-catcher/api-contract`](./packages/api-contract) | Shared TypeScript types and Zod schemas for the viewer API | Private workspace |
| [`@ses-mail-catcher/cdk-mail-handler`](./packages/cdk-lambda-mail-handler) | Mail Lambda handler used by the CDK construct | Private workspace |
| [`@ses-mail-catcher/cdk-viewer-handler`](./packages/cdk-lambda-viewer-handler) | Viewer Lambda handler used by the CDK construct | Private workspace |

## Development

Install dependencies and run the complete verification suite from the
repository root:

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

To run commands for an individual package:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher compile
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
pnpm --filter @ses-mail-catcher/cdk-mail-handler test
pnpm --filter @ses-mail-catcher/cdk-viewer-handler test
pnpm --filter @ses-mail-catcher/local build
pnpm --filter @ses-mail-catcher/local test
pnpm --filter @ses-mail-catcher/viewer dev
```

Build from the repository root when working with the local server and viewer.
Turborepo builds the viewer before the local server copies it into
`packages/local/lib/viewer`. If only the local package is built, the server
still works as an API-only service.

## Local SES server

Build and start the local server:

```sh
pnpm build
node packages/local/lib/cli.js
```

Open <http://127.0.0.1:8005/> to use the bundled viewer. By default, the
server accepts SES v2 `SendEmail` and `SendRawEmail` requests on
`127.0.0.1:8005`.

The bind address and port can be changed with `SES_MAIL_CATCHER_HOST` /
`SES_MAIL_CATCHER_PORT` or the `--host` / `--port` flags. Messages are stored
in SQLite under the operating system's cache directory by default. Use
`SES_MAIL_CATCHER_DB_PATH` or `--db-path` when a fixed or persistent location
is needed:

```sh
ses-mail-catcher --port 8005 --db-path ./tmp/mailbox.sqlite3
```

The server works with the AWS SDK for JavaScript v3 when the SES v2 client is
pointed at the local endpoint and given dummy credentials:

```ts
const ses = new SESv2Client({
  endpoint: 'http://127.0.0.1:8005',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
```

The local server also has a Docker image:

```sh
docker build -f packages/local/Dockerfile -t ses-mail-catcher-local .
docker run --rm -p 8005:8005 \
  -v "$PWD/.ses-mail-catcher:/data" \
  ses-mail-catcher-local
```

The image binds to `0.0.0.0` so the published port is reachable from outside
the container. See [`packages/local/README.md`](./packages/local/README.md) for
the API routes, database locations, and the experimental native binary.

## AWS Serverless construct

The CDK package creates a capture-only backend. `api-mail` is API Gateway +
Lambda and accepts the SES SDK request formats: SES v1 Query requests at `/`
and SES v2 JSON `SendEmail` requests at `/v2/email/outbound-emails`. The
handler converts Simple messages to MIME, preserves Raw messages, and stores
them in S3 with searchable metadata in DynamoDB. It has no SES permissions.

```ts
import { Duration } from 'aws-cdk-lib';
import { SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  retention: Duration.days(7),
  mailApi: { allowedIpCidrs: ['203.0.113.0/24'] },
  viewer: { allowedIpCidrs: ['203.0.113.0/24'] },
});
```

Use `mailCatcher.mailApiEndpoint` as the endpoint of an AWS SDK SES client.
`mailApi.authorization` can optionally be set to `AWS_IAM`, followed by
`mailCatcher.grantMailApiInvoke()` for the sending principal. `mailApi` IP
restrictions use an API Gateway resource policy.

`api-viewer` is a separate read-only API Gateway + Lambda + Hono backend, and
`web-viewer` is a private S3-hosted React app. CloudFront serves both origins
under one browser origin. `viewer.allowedIpCidrs` is required and is enforced
by a CloudFront Function for the web and `/api/*` behavior. Captured HTML is
rendered in a sandboxed iframe.

Applications that need to own the edge logic can pass a user-managed
`cloudfront.IFunction` as `viewer.edgeFunction`. This replaces the built-in IP
allowlist and SPA rewrite, so the supplied function is responsible for access
control and request rewriting.

See [`packages/cdk/README.md`](./packages/cdk/README.md) for the full construct
API, viewer configuration, IAM permissions, and publishing details.

## Documentation

- [Architecture](./docs/architecture.md)
- [Development guide](./docs/development.md)
- [Branching strategy](./docs/branching-strategy.md)
- [Release guide](./docs/release.md)
- [Deployable CDK example](./examples/cdk/README.md)
- [AWS SDK mail sender example](./examples/sdk/README.md)
- [Local server](./packages/local/README.md)
- [AWS CDK construct](./packages/cdk/README.md)
- [CDK mail Lambda workspace](./packages/cdk-lambda-mail-handler/README.md)
- [CDK viewer Lambda workspace](./packages/cdk-lambda-viewer-handler/README.md)
- [React viewer](./packages/viewer/README.md)

## Projen

Generated files for the CDK package are managed by
[projen](https://github.com/projen/projen). Edit `packages/cdk/.projenrc.ts`
when changing CDK project settings, then regenerate the files:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher projen
```
