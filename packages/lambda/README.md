# ses-mail-catcher-lambda

Private workspace containing the Lambda handlers and their runtime modules for
the CDK construct.

The workspace builds two entry points:

- `mail-handler.handler` captures messages in S3 and DynamoDB or relays them
  through Amazon SES; and
- `viewer-handler.handler` serves the bundled viewer and `/api` routes from a
  Lambda function URL.

The build copies the viewer bundle and vendors `postal-mime` into `lib/`. The
CDK workspace then copies that compiled asset into its own published `lib/`
directory. The Lambda build intentionally emits JavaScript only; declarations
and source maps are not needed inside the deployed asset.

Build the repository from its root so Turborepo builds the viewer before this
workspace and the CDK package after it:

```sh
pnpm build
pnpm --filter ses-mail-catcher-lambda test
```

This workspace is private and is not a separately published package.
