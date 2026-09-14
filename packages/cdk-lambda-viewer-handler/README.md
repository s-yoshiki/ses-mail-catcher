# @ses-mail-catcher/cdk-viewer-handler

Private workspace containing the viewer API Lambda used by the CDK construct.

The `handler.handler` entry point is an API Gateway proxy handler built
with Hono. It implements the shared `/api` contract used by the React viewer:
health, message listing, message details, raw MIME, attachments, and,
by default, deleting one or all captured messages.

Static files are not served by this Lambda. The CDK construct deploys the
viewer bundle to a private S3 bucket and serves it through the same CloudFront
distribution as the `/api/*` API Gateway behavior.

## Permissions and delete support

Whether this handler serves DELETE requests is controlled by the `ALLOW_DELETE`
environment variable (`'true'` enables it; anything else, including a missing
value, disables it), which the CDK construct sets from `viewer.allowDelete`
(`@default true`). The handler's own permissions depend on it:

- `ALLOW_DELETE=true` (default): the handler needs DynamoDB read, `DeleteItem`,
  and `BatchWriteItem`, plus S3 read and delete, on the configured table and
  bucket. `DELETE /api/messages/:id` deletes one message and `DELETE
  /api/messages` deletes every message, paging through the table and stopping
  once a roughly 20-second time budget elapses; a `hasMore: true` response
  means the caller should repeat the call. `GET /api/health` reports
  `features.delete: true`.
- `ALLOW_DELETE=false`: the handler only needs DynamoDB and S3 read
  permissions. DELETE requests answer `405`, and health reports
  `features.delete: false`.

When delete support is enabled, the handler also guards DELETE requests
against cross-origin calls: it rejects a request whose `Sec-Fetch-Site` header
is present and is not `same-origin` or `none`; only when that header is
absent does it fall back to comparing the `Origin` header's host against the
`Host` header, rejecting on a mismatch. A request with neither header is
allowed through. No CORS headers are sent, so a genuinely cross-origin browser
request fails regardless of this guard.

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
