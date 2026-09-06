# ses-mail-catcher-cdk-lambda-mail-handler

Private workspace for the mail-processing Lambda handler used by the CDK
construct.

The `mail-handler.handler` entry point validates `SendMailEvent` objects,
creates raw MIME messages, and either stores them in S3 and DynamoDB (`CATCH`)
or relays them through Amazon SES (`RELAY`).

The build emits JavaScript only. The CDK package copies this workspace's
compiled `lib/` directory into the `mail-handler/` directory of its published
Lambda asset.

Run its tests with:

```sh
pnpm --filter ses-mail-catcher-cdk-lambda-mail-handler test
```

This workspace is private and is not published separately.
