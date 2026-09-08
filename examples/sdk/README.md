# AWS SDK mail sender example

This workspace sends an email to an SES v2-compatible endpoint using the AWS
SDK for JavaScript v3 and `SESv2Client`. It works with the local server and
with the CDK example's CloudFront URL.

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
  pnpm --filter ses-mail-catcher-sdk-example run send
```

The sender creates an `SESv2Client` with the configured endpoint and sends a
`SendEmailCommand`. Open the local viewer at
<http://127.0.0.1:8005/> to inspect the captured message.

## Message patterns

Set `MAIL_PATTERN` to choose the request body:

| Pattern | SES v2 content | Use case |
| --- | --- | --- |
| `text` | `Content.Simple` with text only | Plain-text mail |
| `html` | `Content.Simple` with HTML only | HTML-only mail |
| `multipart` | `Content.Simple` with text and HTML | HTML with a text fallback |
| `attachment` | `Content.Simple` with text, HTML, and an attachment | Attachment handling |
| `raw` | `Content.Raw` with a multipart MIME message | Custom MIME headers and structure |
| `template` | `CreateEmailTemplate` + templated `SendEmail` | Real SES-compatible services |

For example, send HTML only:

```sh
SES_MAIL_CATCHER_URL=http://127.0.0.1:8005 \
MAIL_PATTERN=html \
MAIL_HTML='<h1>Hello</h1><p>This is an HTML message.</p>' \
pnpm --filter ses-mail-catcher-sdk-example run send
```

Send HTML with a text fallback:

```sh
SES_MAIL_CATCHER_URL=http://127.0.0.1:8005 \
MAIL_PATTERN=multipart \
MAIL_TEXT='This is the plain-text fallback.' \
MAIL_HTML='<p>This is the <strong>HTML</strong> version.</p>' \
pnpm --filter ses-mail-catcher-sdk-example run send
```

Send an attachment:

```sh
SES_MAIL_CATCHER_URL=http://127.0.0.1:8005 \
MAIL_PATTERN=attachment \
MAIL_ATTACHMENT_FILENAME=hello.txt \
MAIL_ATTACHMENT_CONTENT='This content is attached to the message.' \
pnpm --filter ses-mail-catcher-sdk-example run send
```

`MAIL_HTML` is optional for `html`, `multipart`, `attachment`, `raw`, and
`template`; when omitted, the example generates a small HTML body from
`MAIL_SUBJECT` and `MAIL_TEXT`.

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
| `MAIL_CC` | Omitted; comma-separated addresses |
| `MAIL_BCC` | Omitted; comma-separated addresses |
| `MAIL_REPLY_TO` | Omitted; comma-separated addresses |
| `MAIL_SUBJECT` | `ses-mail-catcher SDK example` |
| `MAIL_TEXT` | A short SDK example message |
| `MAIL_HTML` | Omitted |
| `MAIL_PATTERN` | Automatically selected; `text`, `html`, `multipart`, `attachment`, `raw`, or `template` |
| `MAIL_ATTACHMENT_FILENAME` | `example.txt` |
| `MAIL_ATTACHMENT_CONTENT` | A short attachment body |
| `MAIL_ATTACHMENT_CONTENT_TYPE` | `text/plain` |
| `MAIL_TEMPLATE_NAME` | `ses-mail-catcher-sdk-example-template` for `template` |
| `MAIL_TEMPLATE_DATA` | `{"name":"developer"}` |

The command prints the SES message ID returned by the endpoint. The local
server and the CDK example support `SendEmail` with `Content.Simple` and
`Content.Raw`. The `template` pattern requires an SES-compatible endpoint that
also supports `CreateEmailTemplate`; it is not implemented by the local or
CDK mail-catcher endpoint.

## Send through the CDK CloudFront URL

The CDK example exposes the SES API at the same CloudFront domain as the
viewer, under `/v2/email/outbound-emails`. The SES API route does not require
the viewer's Basic Auth, so the SDK can use the standard AWS SDK request
without custom authentication middleware:

```sh
SES_MAIL_CATCHER_URL=https://dxxxxxxxxxxxx.cloudfront.net \
MAIL_PATTERN=multipart \
MAIL_HTML='<h1>Captured in AWS</h1>' \
pnpm --filter ses-mail-catcher-sdk-example run send
```

Use the `SesApiUrl` stack output as the endpoint. The direct Lambda origin URL
is IAM-protected and is not intended to be used as the SDK endpoint. The
viewer root remains protected by Basic Auth.
