# CDK deployment example

This workspace is a deployable CDK application that creates a
`SesMailCatcher` in `CATCH` mode and a viewer protected by CloudFront Edge
Basic Auth. It is useful for trying the published construct shape against a
real AWS account.

The stack creates:

- an S3 bucket for raw MIME messages;
- a DynamoDB table for searchable message metadata;
- a Lambda function that accepts `SendMailEvent` objects;
- a Lambda function URL serving the viewer, protected with IAM and CloudFront
  Origin Access Control;
- a SES v2-compatible `SendEmail` endpoint on the same CloudFront distribution;
- a CloudFront distribution with a viewer-request CloudFront Function; and
- a Secrets Manager secret containing the viewer credentials, synchronized to
  CloudFront KeyValueStore after deployment.

The generated password is kept in Secrets Manager and is not written to the
CloudFormation template or stack outputs. The deploy script reads it locally
and writes only the Base64 Basic Auth payload to CloudFront KeyValueStore; it
never prints the password.

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
pnpm --filter ses-mail-catcher-cdk-example bootstrap
pnpm --filter ses-mail-catcher-cdk-example synth
AWS_PROFILE=s-yoshiki pnpm --filter ses-mail-catcher-cdk-example run deploy
```

`deploy` uses `--require-approval never` because this example is intended for
repeatable, non-interactive demonstrations. It runs the CDK deployment and
then synchronizes the generated Secrets Manager credentials to the
CloudFront KeyValueStore. Review the synthesized template with `synth` or
`diff` before deploying it to a shared account.

If the stack is already deployed, synchronize the credentials again with:

```sh
AWS_PROFILE=s-yoshiki pnpm --filter ses-mail-catcher-cdk-example run sync:edge-auth
```

After deployment, inspect the stack outputs:

```sh
aws cloudformation describe-stacks \
  --stack-name SesMailCatcherCdkExample \
  --query 'Stacks[0].Outputs'
```

Read the generated viewer credentials from the secret ARN output:

```sh
viewer_secret_arn="$(aws cloudformation describe-stacks \
  --stack-name SesMailCatcherCdkExample \
  --query 'Stacks[0].Outputs[?OutputKey==`ViewerCredentialsSecretArn`].OutputValue' \
  --output text)"
aws secretsmanager get-secret-value \
  --secret-id "$viewer_secret_arn" \
  --query SecretString \
  --output text
```

Open the `ViewerUrl` output in a browser. The browser should show the Basic
Auth dialog; use the username and password from the secret. The `ViewerUrl`
and `SesApiUrl` outputs point to the same CloudFront distribution. The root
path serves the viewer, while `/v2/email/outbound-emails` accepts SES v2
`SendEmail` requests. The underlying Lambda Function URLs are IAM protected
and are not exposed as public application endpoints.

The viewer-request CloudFront Function checks the browser's
`Authorization: Basic ...` header against the `basic-auth` key in CloudFront
KeyValueStore for the viewer's root path. The SES API behavior does not attach
the Basic Auth function, so standard SES v2 SDK requests can reach
`/v2/email/outbound-emails`. Both Lambda Function URLs use `AWS_IAM` with
Origin Access Control, so their direct URLs cannot bypass CloudFront.

The CloudFront Function source is kept in
`examples/cdk/src/edge-basic-auth-function.js`. The CDK stack reads that file
with `node:fs` at synth time and passes the source to
`cloudfront.FunctionCode.fromInline()`.

## Capture a test message

Invoke the handler named in the `MailHandlerName` output:

```sh
mail_handler_name="$(aws cloudformation describe-stacks \
  --stack-name SesMailCatcherCdkExample \
  --query 'Stacks[0].Outputs[?OutputKey==`MailHandlerName`].OutputValue' \
  --output text)"
aws lambda invoke \
  --function-name "$mail_handler_name" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"from":"noreply@example.com","to":["developer@example.com"],"subject":"ses-mail-catcher example","text":"This message was captured by the CDK example."}' \
  /tmp/ses-mail-catcher-example-response.json
```

Refresh the viewer to see the captured message. The Lambda returns the message
ID and the S3 key in the response file.

## Send with the AWS SDK example

The SDK example uses the same CloudFront URL as an SES v2 endpoint. Set the
`SES_MAIL_CATCHER_URL` to the `SesApiUrl` output. The API behavior intentionally
does not require Basic Auth, so the SDK example uses the normal AWS SDK
credential provider chain without custom headers:

```sh
SES_MAIL_CATCHER_URL=https://your-cloudfront-domain.cloudfront.net \
MAIL_PATTERN=multipart \
MAIL_HTML='<h1>HTML from SESv2</h1><p>Captured by the CDK example.</p>' \
pnpm --filter ses-mail-catcher-sdk-example run send
```

Use the `SesApiUrl` stack output for `SES_MAIL_CATCHER_URL`. The supported
request path is `/v2/email/outbound-emails`; the SDK appends it automatically.

## Remove the example stack

The construct uses disposable storage with a seven-day retention period, and
the example stack enables automatic deletion of captured objects when the
stack is destroyed:

```sh
pnpm --filter ses-mail-catcher-cdk-example destroy
```
