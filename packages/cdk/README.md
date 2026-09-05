# @s-yoshiki/cdk-ses-mail-catcher

[![View on Construct Hub](https://constructs.dev/badge?package=%40s-yoshiki%2Fcdk-ses-mail-catcher)](https://constructs.dev/packages/%40s-yoshiki%2Fcdk-ses-mail-catcher)

An AWS CDK Construct Library for safely capturing emails in development and
staging environments, or relaying them through Amazon SES in production.

The construct accepts a small mail event rather than attempting to emulate the
SES API. Captured messages are stored as raw MIME in S3, with searchable
metadata in DynamoDB.

## Usage

```ts
import { Duration, Stack } from "aws-cdk-lib";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { MailMode, SesMailCatcher } from "@s-yoshiki/cdk-ses-mail-catcher";

const stack = new Stack();
const mailCatcher = new SesMailCatcher(stack, "MailCatcher", {
  retention: Duration.days(7),
  mode: MailMode.CATCH,
});

const applicationFunction = new Function(stack, "Application", {
  runtime: Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: Code.fromInline("exports.handler = async () => undefined;"),
});
mailCatcher.grantSend(applicationFunction);
```

The application invokes `mailCatcher.function` with an event such as:

```ts
{
  from: "noreply@example.com",
  to: ["developer@example.com"],
  subject: "Registration complete",
  text: "Welcome!",
  html: "<h1>Welcome!</h1>",
  mailbox: "development",
}
```

In `CATCH` mode the Lambda writes a canonical raw MIME message to S3 under
`mail/{mailbox}/YYYY/MM/DD/{messageId}.eml` and stores its index in DynamoDB.
Both resources use the configured retention period; DynamoDB uses TTL and S3
uses a lifecycle expiration rule. The construct deliberately does not grant
SES permissions in this mode.

For production relay, opt in explicitly:

```ts
new SesMailCatcher(stack, "MailRelay", {
  mode: MailMode.RELAY,
  relay: { configurationSetName: "production" },
});
```

Relay mode grants the handler `ses:SendEmail` and `ses:SendRawEmail` and sends
the same raw MIME representation through SES. Attachments are passed as S3
references (`bucket`, `key`); the referenced bucket must grant read access to
`mailCatcher.function`.

The public resources are available as `mailCatcher.function`,
`mailCatcher.bucket`, and `mailCatcher.table`. Use `grantSend()` to give an
application Lambda permission to invoke the handler. Viewer, HTTP API, and
queue-based transports are intentionally reserved for a later release.

The Lambda implementation is kept as regular TypeScript modules: the handler
only orchestrates validation, MIME creation, storage, and relay; each concern
has its own module and AWS clients are injected in tests. The compiled `lib/`
asset is packaged with the Construct and used as the Lambda source.

## Development

```sh
pnpm install
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher build
```

Generated project files are managed by [projen](https://github.com/projen/projen).
Edit `.projenrc.ts` and run `pnpm --filter @s-yoshiki/cdk-ses-mail-catcher projen` when
changing project settings.

## Publishing

The package is configured for public npm publishing and jsii-compatible API
generation. The CI workflow validates the package before release; npm
publication and Trusted Publishing credentials should be configured in the
repository before the first release. Public jsii-compatible packages with a
recognized CDK keyword are automatically discoverable by Construct Hub after
they are published to npm.
