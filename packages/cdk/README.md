# @s-yoshiki/cdk-ses-mail-catcher

[![View on Construct Hub](https://constructs.dev/badge?package=%40s-yoshiki%2Fcdk-ses-mail-catcher)](https://constructs.dev/packages/%40s-yoshiki%2Fcdk-ses-mail-catcher)

An AWS CDK Construct Library for capturing SES requests in development and
staging environments. The construct is intentionally capture-only: it does
not send captured messages through SES.

## Usage

```ts
import { Duration } from 'aws-cdk-lib';
import { ApiAuthorization, SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  retention: Duration.days(7),
  mailApi: {
    // NONE is the default. Use AWS_IAM when the sender signs the SDK request.
    authorization: ApiAuthorization.AWS_IAM,
    allowedIpCidrs: ['203.0.113.0/24'],
  },
  viewer: {
    // Optional: restrict the viewer at the CloudFront edge.
    allowedIpCidrs: ['203.0.113.0/24'],
  },
});
```

`mailApi` is an API Gateway REST API backed by a Lambda function using Hono.
It accepts the request protocols emitted by the AWS SES SDK:

- SES API v1 Query protocol at `POST /` (`SendEmail` and `SendRawEmail`);
- SES API v2 JSON protocol at `POST /v2/email/outbound-emails` (`SendEmail`);
- v2 `Content.Simple` and `Content.Raw` messages.

Templates are outside the scope of the catcher. The API converts Simple
content into canonical raw MIME, preserves Raw MIME bytes, stores the message
body in S3, and stores searchable metadata in DynamoDB. The Lambda has only
S3 write and DynamoDB write permissions; it has no SES permissions.

Use the construct endpoint directly with an AWS SDK SES client:

```ts
const ses = new SESv2Client({
  endpoint: mailCatcher.mailApiEndpoint,
  region: 'ap-northeast-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
```

When `authorization` is `AWS_IAM`, grant the sending principal permission to
invoke the API:

```ts
mailCatcher.grantMailApiInvoke(applicationFunction);
```

`allowedIpCidrs` on `mailApi` creates an API Gateway resource policy with an
explicit `Deny` for requests outside the configured IPv4/IPv6 ranges. Both
authorization and the IP policy are optional for development environments.

The public resources are available as `mailCatcher.mailApi`,
`mailCatcher.mailFunction`, `mailCatcher.bucket`, and `mailCatcher.table`.
Storage created by the construct is disposable and is removed with the stack;
the retention period is also applied to the S3 lifecycle rule and DynamoDB
TTL.

## Viewer

The viewer is created by default and consists of three parts:

- `api-viewer`: API Gateway + Lambda + Hono, exposing the shared `/api`
  contract with read and, by default, delete access to DynamoDB/S3;
- `web-viewer`: a private S3 bucket containing the React application;
- one CloudFront distribution with the S3 bucket as its default origin and
  `api-viewer` as the `/api/*` origin.

Both are therefore served from the same browser origin. The viewer Lambda does
not serve static files. By default it has DynamoDB read/delete and S3
read/delete permissions; set `viewer.allowDelete: false` to keep it read-only
(see [Deleting captured messages](#deleting-captured-messages) below).

The viewer uses a built-in CloudFront Function for IP filtering and SPA route
rewriting. If `allowedIpCidrs` is omitted, the function defaults to allowing
all IPv4 and IPv6 ranges (`0.0.0.0/0` and `::/0`), which is intended for
development environments:

```ts
const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  viewer: {
    allowedIpCidrs: ['192.0.2.10/32', '2001:db8:1234::/48'],
  },
});
```

The construct creates a CloudFront Function that checks the viewer IP and
rewrites extensionless SPA routes to `index.html`. The same function is
attached to the `/api/*` behavior, so the browser and viewer API receive the
same edge IP restriction. `mailCatcher.viewerUrl` is the URL to open.

Basic authentication is also available through a CloudFront KeyValueStore:

```ts
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

const authStore = cloudfront.KeyValueStore.fromKeyValueStoreArn(
  stack,
  'ViewerAuthStore',
  'arn:aws:cloudfront::123456789012:key-value-store/KEY_VALUE_STORE_ID',
);

const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  viewer: {
    basicAuth: { keyValueStore: authStore },
  },
});
```

The KeyValueStore must contain the expected `Authorization` header value,
including the `Basic ` prefix, under the `authorization` key by default. The
construct does not receive or store the username/password; populate the store
through an operational process outside the synthesized template. A custom
`key` and `realm` can be supplied. `allowedIpCidrs` and `basicAuth` may be used
together, in which case both checks must pass.

To manage the CloudFront Function in the application instead, pass an existing
`cloudfront.IFunction` as `edgeFunction`:

```ts
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

const edgeFunction = new cloudfront.Function(stack, 'ViewerEdgeFunction', {
  code: cloudfront.FunctionCode.fromInline('function handler(event) { return event.request; }'),
});

const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  viewer: { edgeFunction },
});
```

The supplied function replaces the built-in IP allowlist and SPA rewrite and
is attached to both the web and `/api/*` behaviors. It must implement any
access control and request rewriting required by the application. When
`allowedIpCidrs` is explicitly set to an empty array, the construct rejects
the configuration because the built-in function would deny every request.
`basicAuth` cannot be combined with `edgeFunction`; a custom function owns the
complete viewer access policy.

The viewer API implements the same contract as the local server: health,
message listing, message details, raw MIME, attachments, and, by default,
deleting one or all captured messages. Captured HTML is rendered only in the
viewer's sandboxed iframe because it is untrusted input.

### Deleting captured messages

`viewer.allowDelete` defaults to `true`, so the viewer can delete a single
message (`DELETE /api/messages/:id`) or every captured message (`DELETE
/api/messages`). When enabled, the construct grants the viewer function
`dynamodb:DeleteItem` and `dynamodb:BatchWriteItem` on the message table and
S3 delete permissions on the storage bucket (`bucket.grantDelete`), and the
`/api/*` CloudFront behavior allows all HTTP methods instead of only GET and
HEAD. Set `viewer.allowDelete: false` to keep the viewer read-only:

```ts
const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  viewer: {
    allowDelete: false,
  },
});
```

With `allowDelete: false`, none of the delete permissions above are granted,
`GET /api/health` reports `features.delete: false`, and the Lambda answers
DELETE requests with `405`. Deleting every message is time-budgeted: the
Lambda stops after roughly 20 seconds and returns `hasMore: true` so the
viewer can repeat the call until every message is gone. The Lambda also
rejects cross-origin DELETE requests: it checks the `Sec-Fetch-Site` header
first (only `same-origin` or `none` are accepted) and, only when that header
is absent, falls back to comparing the `Origin` header's host against `Host`;
a request with neither header is allowed through. No CORS headers are sent,
so a genuinely cross-origin browser request fails regardless — this guard
exists to return a clear `403` instead of relying on that failure.

The Lambda implementations live in two private workspaces:
[`@ses-mail-catcher/cdk-mail-handler`](../cdk-lambda-mail-handler) owns SES
protocol parsing, MIME normalization, and storage, while
[`@ses-mail-catcher/cdk-viewer-handler`](../cdk-lambda-viewer-handler) owns the
viewer API. Both use Hono's AWS Lambda adapter. Each workspace is compiled and
bundled into the CDK package; the deployed assets do not depend on workspace
`node_modules`.

## Development

```sh
pnpm install
pnpm build
pnpm --filter @ses-mail-catcher/cdk-mail-handler test
pnpm --filter @ses-mail-catcher/cdk-viewer-handler test
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
```

Generated project files are managed by [projen](https://github.com/projen/projen).
Edit `.projenrc.ts` and run `pnpm --filter @s-yoshiki/cdk-ses-mail-catcher projen`
when changing project settings.

## Publishing

The package is configured for public npm publishing and jsii-compatible API
generation. The CI workflow validates the package before release; npm
publication and Trusted Publishing credentials should be configured in the
repository before the first release.
