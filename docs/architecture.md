# Architecture

`ses-mail-catcher` has a local backend and an AWS backend. Both store captured
messages and serve the same viewer API contract.

```text
AWS SDK SES client
       │ SES v1 Query / SES v2 JSON
       ▼
api-mail: API Gateway REST API
       ▼
Lambda + Hono ───────────────┐
       │                     │
       ▼                     ▼
  S3 raw MIME          DynamoDB metadata
                             │
                             ▼
web-viewer: CloudFront ── /api/* ──> api-viewer: API Gateway
       │                                      ▼
       └─ S3 static app                 Lambda + Hono
```

## AWS serverless construct

`@s-yoshiki/cdk-ses-mail-catcher` provisions a capture-only AWS backend:

- `api-mail` is a regional API Gateway REST API and Lambda. The root route
  accepts SES API v1 `SendEmail` and `SendRawEmail` Query requests. The
  `/v2/email/outbound-emails` route accepts SES API v2 `SendEmail` JSON
  requests from the AWS SDK.
- Hono owns the Lambda HTTP adapter in both API Lambdas. SES protocol parsing,
  MIME normalization, and DynamoDB/S3 access remain explicit domain modules so
  the protocol behavior can be tested without API Gateway.
- Simple messages are converted to canonical raw MIME. Raw messages are
  preserved and stored in S3. DynamoDB stores searchable metadata, the S3 key,
  size, and a TTL timestamp.
- `api-viewer` is a separate regional API Gateway REST API and read-only Lambda.
  It implements the shared `/api` contract for health, lists, details, raw
  MIME, and attachments.
- `web-viewer` is a private S3 bucket containing the compiled React viewer.
  CloudFront uses S3 as its default origin and `api-viewer` for `/api/*`, so
  the browser sees one origin and does not need CORS configuration.
- The viewer Lambda does not serve static files. The two Lambda assets are
  compiled and bundled into the CDK package's published `lib` directory; the
  deployed assets do not rely on workspace `node_modules`.
- The construct creates disposable S3 and DynamoDB resources by default. S3
  uses lifecycle expiration and DynamoDB uses TTL for the retention period.

The construct does not grant `ses:SendEmail` or `ses:SendRawEmail`. The mail
API is unauthenticated by default for development use. An application can opt
into API Gateway IAM authorization, and either API can be restricted by IP:
`api-mail` uses an API Gateway resource policy, while the CloudFront-hosted
viewer uses a CloudFront Function attached to both the web and `/api/*`
behaviors. A viewer configuration must contain at least one allowed CIDR.

This is deliberately a sandbox/mock capture service, not a replacement for
Amazon SES. SES template operations are not implemented, and captured
messages are untrusted data.

## Viewer security boundary

CloudFront is the intended entry point for the viewer. The viewer request
function checks the source IPv4/IPv6 address before static or API origin
processing and rewrites extensionless client-side routes to `index.html`.
The API Lambda grants read access only to the existing message table and
bucket. Captured HTML is rendered only in a sandboxed iframe in the React app.

## Local

`@ses-mail-catcher/local` exposes a small SES v2-compatible JSON endpoint and
stores messages in a disposable SQLite cache by default. It serves the viewer
bundle and the `/api` contract from one local HTTP server. Set
`SES_MAIL_CATCHER_DB_PATH` or `--db-path` when a fixed database location is
required.

The local backend intentionally does not share the AWS Lambda implementation:
it uses SQLite and the local server's native HTTP adapter, while the AWS
backend uses API Gateway, Hono, S3, and DynamoDB.

## Distribution

- CDK: npm package `@s-yoshiki/cdk-ses-mail-catcher`.
- Local: Docker image built from `packages/local/Dockerfile`.
- Native binary: `scriptc` remains an experimental host-native option; the
  Node.js CLI and container image are the supported baseline.
