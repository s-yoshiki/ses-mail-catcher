# @ses-mail-catcher/cdk-viewer-handler

Private workspace containing the read-only viewer API Lambda used by the CDK
construct.

The `viewer-handler.handler` entry point is an API Gateway proxy handler built
with Hono. It implements the shared `/api` contract used by the React viewer:
health, message listing, message details, raw MIME, and attachments.

Static files are not served by this Lambda. The CDK construct deploys the
viewer bundle to a private S3 bucket and serves it through the same CloudFront
distribution as the `/api/*` API Gateway behavior. The handler has only
DynamoDB read and S3 read permissions.

The build bundles Hono and vendors `postal-mime` into `lib/`. The CDK package
copies the compiled asset into its published Lambda directory; the deployed
handler has no workspace `node_modules` dependency.

Build the repository from its root so Turborepo builds the viewer before this
workspace and the CDK package after it:

```sh
pnpm build
pnpm --filter @ses-mail-catcher/cdk-viewer-handler test
```

This workspace is private and is not published separately.
