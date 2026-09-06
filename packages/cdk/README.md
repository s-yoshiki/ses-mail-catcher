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
application Lambda permission to invoke the handler. Queue-based transports are
intentionally reserved for a later release.

## Viewer

`viewer` adds a Lambda function URL that serves the same React viewer as the
local server, reading messages straight from DynamoDB and S3. It is not created
unless asked for, and it only works in `CATCH` mode, because relay mode stores
nothing.

Captured mail is exactly the kind of thing that should not sit on an open URL,
so the construct refuses to create a viewer without some form of access
control. Two are built in and can be combined.

```ts
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

const credentials = new Secret(stack, "ViewerCredentials", {
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: "developer" }),
    generateStringKey: "password",
  },
});

const mailCatcher = new SesMailCatcher(stack, "MailCatcher", {
  viewer: {
    basicAuth: { secret: credentials },
    allowedIpCidrs: ["203.0.113.0/24"],
  },
});
```

`mailCatcher.viewerUrl` is the address to open, and `mailCatcher.viewerFunction`
is the function behind it.

- **Basic authentication** reads its credentials from a Secrets Manager secret
  at run time, so they never appear in the synthesized template. The secret
  holds JSON; `usernameField` and `passwordField` rename the fields it reads.
  Credentials are compared with a constant-time digest comparison.
- **Address ranges** accept IPv4 and IPv6 CIDR blocks. The address comes from
  the function URL request context rather than a forwarded header, so a caller
  cannot spoof it.

The function URL uses `AuthType.NONE` by default, because a browser cannot sign
requests; the checks above are what protect the messages. Set
`authType: FunctionUrlAuthType.AWS_IAM` when the viewer is reached through a
signing client instead. A viewer with no access control at all has to be
acknowledged explicitly with `allowPublicAccess: true`.

The viewer function is granted read access only: `dynamodb:Query`/`Scan` on the
table, `s3:GetObject` on the bucket, and `secretsmanager:GetSecretValue` on the
credentials secret.

The Lambda asset carries the built viewer bundle and a vendored copy of
[postal-mime](https://github.com/postalsys/postal-mime) (MIT-0) under
`lib/vendor`, because the asset is the compiled `lib` directory and has no
`node_modules` of its own.

The Lambda implementation is kept in two private workspaces:
[`cdk-lambda-mail-handler`](../cdk-lambda-mail-handler) owns
validation, MIME creation, storage, and relay, while
[`cdk-lambda-viewer-handler`](../cdk-lambda-viewer-handler)
owns the viewer API and static assets. Each workspace has its own tests and
compiled asset; the CDK package copies them into separate directories in its
`lib/` directory and uses those directories as the Lambda sources.

## Development

```sh
pnpm install
pnpm build
pnpm --filter cdk-lambda-mail-handler test
pnpm --filter cdk-lambda-viewer-handler test
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
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
