# CDK deployment example

This workspace is a deployable CDK application that creates the capture-only
`SesMailCatcher` construct and its CloudFront-hosted viewer. It is useful for
trying the published construct shape against a development AWS account.

The stack creates:

- `api-mail`: API Gateway + Lambda for SES SDK v1 Query and v2 JSON requests;
- an S3 bucket for raw MIME messages;
- a DynamoDB table for searchable message metadata;
- `api-viewer`: read-only API Gateway + Lambda for the viewer contract;
- `web-viewer`: a private S3 bucket for the React application; and
- one CloudFront distribution using S3 as the default origin and
  `api-viewer` for `/api/*`.

The viewer is protected by a CloudFront Function IP allowlist. Set
`VIEWER_ALLOWED_IP_CIDR` to the public IPv4 or IPv6 CIDR of the development
machine before synthesizing or deploying. The sample intentionally fails if
the value is missing.

## Prerequisites

- Node.js 24 and pnpm 11.25.0;
- AWS credentials configured for the account and region to deploy to; and
- permission to bootstrap and deploy AWS CDK stacks.

The CDK CLI uses the standard `CDK_DEFAULT_ACCOUNT` and
`CDK_DEFAULT_REGION` values supplied by the CLI. Set `AWS_PROFILE` or the
usual AWS environment variables when selecting credentials.

## Synthesize and deploy

Run these commands from the repository root:

```sh
pnpm install
VIEWER_ALLOWED_IP_CIDR=198.51.100.10/32 \
  pnpm --filter ses-mail-catcher-cdk-example bootstrap
VIEWER_ALLOWED_IP_CIDR=198.51.100.10/32 \
  pnpm --filter ses-mail-catcher-cdk-example synth
VIEWER_ALLOWED_IP_CIDR=198.51.100.10/32 AWS_PROFILE=s-yoshiki \
  pnpm --filter ses-mail-catcher-cdk-example run deploy
```

Replace the documentation-range address with the actual address used to open
the viewer. After deployment, inspect the stack outputs:

```sh
aws cloudformation describe-stacks \
  --stack-name SesMailCatcherCdkExample \
  --query 'Stacks[0].Outputs'
```

Open `ViewerUrl` in a browser. `SesApiUrl` is the endpoint to pass to an AWS
SDK SES client. The CloudFront distribution serves the web app at `/` and
routes `/api/*` to the separate viewer API. Static files remain in a private
S3 bucket, and the Lambda functions have only the storage permissions needed
for their direction: mail writes, viewer reads.

## Capture a test message

Use the AWS SDK example with the `SesApiUrl` output:

```sh
SES_MAIL_CATCHER_URL=https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/prod/ \
MAIL_PATTERN=multipart \
MAIL_HTML='<h1>HTML from SESv2</h1><p>Captured by the CDK example.</p>' \
pnpm --filter ses-mail-catcher-sdk-example run send
```

The same endpoint accepts SES v1 Query requests and SES v2 `SendEmail` JSON
requests, so applications using either SES SDK protocol can point their
development client at `SesApiUrl`. The `template` pattern remains unsupported
by the catcher.

## Optional IAM authorization

The example uses the default unauthenticated API mode to keep development
setup small. To require SigV4 for the mail API, configure
`mailApi.authorization: ApiAuthorization.AWS_IAM` in the example stack and
grant the sender `mailCatcher.grantMailApiInvoke(...)`.

## Remove the example stack

The construct uses disposable storage with a seven-day retention period and
enables automatic deletion of captured objects when the stack is destroyed:

```sh
VIEWER_ALLOWED_IP_CIDR=198.51.100.10/32 \
  pnpm --filter ses-mail-catcher-cdk-example destroy
```
