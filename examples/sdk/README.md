# AWS SDK mail sender example

This workspace sends an email to the SES v2-compatible endpoint exposed by
[`ses-mail-catcher-local`](../../packages/local/README.md), using the AWS SDK
for JavaScript v3 and `SESv2Client`.

The endpoint is configurable, so the same client shape can be used with any
SES-compatible endpoint. The default points to the local server at
`http://127.0.0.1:8005`.

## Prerequisites

- Start the local server first;
- Node.js 24 and pnpm 11.25.0; and
- dummy AWS credentials for the local endpoint (the example supplies them by
  default).

Start the local server from the repository root in another terminal:

```sh
pnpm build
node packages/local/lib/cli.js --port 8005
```

## Send a message

Run from the repository root:

```sh
SES_MAIL_CATCHER_URL=http://127.0.0.1:8005 \
  MAIL_TO=developer@example.com \
  MAIL_SUBJECT='SDK example message' \
  MAIL_TEXT='This message was sent to the mail catcher with AWS SDK v3.' \
  MAILBOX=example \
  pnpm --filter ses-mail-catcher-sdk-example send
```

The sender creates an `SESv2Client` with the configured endpoint and sends a
`SendEmailCommand`. Open the local viewer at
<http://127.0.0.1:8005/> to inspect the captured message.

The default region is `ap-northeast-1`. Set `AWS_REGION` when a different
region is needed. For a real SES endpoint, also set
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or use the usual AWS credential
provider configuration.

The following environment variables customize the event:

| Variable | Default |
| --- | --- |
| `SES_MAIL_CATCHER_URL` | `http://127.0.0.1:8005` |
| `MAIL_FROM` | `noreply@example.com` |
| `MAIL_TO` | `developer@example.com` |
| `MAIL_SUBJECT` | `ses-mail-catcher SDK example` |
| `MAIL_TEXT` | A short SDK example message |
| `MAIL_HTML` | Omitted |
| `MAILBOX` | Omitted, which stores the message in `default` |
| `MAIL_TEMPLATE_NAME` | Omitted; creates an SES email template when set |

The command prints the SES message ID returned by the endpoint. The local
server supports `SendEmail` and `SendRawEmail`; use `MAIL_TEMPLATE_NAME` only
with an SES-compatible endpoint that supports `CreateEmailTemplate`.
