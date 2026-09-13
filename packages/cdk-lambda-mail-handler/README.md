# @ses-mail-catcher/cdk-mail-handler

Private workspace for the mail-processing Lambda used by the CDK construct.

The `mail-handler.handler` entry point is an API Gateway proxy handler built
with Hono. It receives the request shapes emitted by the AWS SES SDK:

- SES API v1 Query protocol (`SendEmail` and `SendRawEmail`) at `/`;
- SES API v2 JSON protocol (`SendEmail`) at `/v2/email/outbound-emails`.

Simple messages are converted to raw MIME, Raw messages are preserved, and
the result is written to S3 and DynamoDB. SES permissions and relay behavior
are intentionally not part of this workspace.

The build bundles Hono into the JavaScript entry point. The CDK package copies
the compiled `lib/` directory into its published Lambda asset, so the
deployed handler has no workspace `node_modules` dependency.

Run its tests with:

```sh
pnpm --filter @ses-mail-catcher/cdk-mail-handler test
```

This workspace is private and is not published separately.
