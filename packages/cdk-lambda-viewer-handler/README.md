# cdk-lambda-viewer-handler

Private workspace containing the viewer Lambda handler and its runtime modules
for the CDK construct.

The workspace builds one entry point:

- `viewer-handler.handler` serves the bundled viewer and `/api` routes from a
  Lambda function URL.

The build copies the viewer bundle and vendors `postal-mime` into `lib/`. The
CDK workspace then copies that compiled asset into its own published
`lib/viewer-handler/` directory. The Lambda build intentionally emits
JavaScript only; declarations and source maps are not needed inside the
deployed asset.

Build the repository from its root so Turborepo builds the viewer before this
workspace and the CDK package after it:

```sh
pnpm build
pnpm --filter cdk-lambda-viewer-handler test
```

This workspace is private and is not a separately published package.
