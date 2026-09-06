# CDK deployment example

This workspace is a deployable CDK application that creates a
`SesMailCatcher` in `CATCH` mode and a password-protected viewer. It is useful
for trying the published construct shape against a real AWS account.

The stack creates:

- an S3 bucket for raw MIME messages;
- a DynamoDB table for searchable message metadata;
- a Lambda function that accepts `SendMailEvent` objects;
- a Lambda function URL serving the viewer; and
- a Secrets Manager secret containing the viewer credentials.

The generated password is kept in Secrets Manager and is not written to the
CloudFormation template or stack outputs.

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
pnpm --filter ses-mail-catcher-cdk-example deploy
```

`deploy` uses `--require-approval never` because this example is intended for
repeatable, non-interactive demonstrations. Review the synthesized template
with `synth` or `diff` before deploying it to a shared account.

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

Open the `ViewerUrl` output in a browser and use the username and password
from the secret.

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
  --payload '{"from":"noreply@example.com","to":["developer@example.com"],"subject":"ses-mail-catcher example","text":"This message was captured by the CDK example.","mailbox":"example"}' \
  /tmp/ses-mail-catcher-example-response.json
```

Refresh the viewer to see the captured message. The Lambda returns the message
ID and the S3 key in the response file.

## Remove the example stack

The construct uses disposable storage with a seven-day retention period, and
the example stack enables automatic deletion of captured objects when the
stack is destroyed:

```sh
pnpm --filter ses-mail-catcher-cdk-example destroy
```
