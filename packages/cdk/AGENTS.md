# CDK package instructions

This package is generated with Projen and compiled with jsii.

- Edit `.projenrc.ts` for package metadata, dependencies, and generated settings.
- Keep package metadata scoped as `@s-yoshiki/cdk-ses-mail-catcher`.
- Keep relative imports explicit with `.js` suffixes because the package is ESM.
- Keep the Lambda handlers in `packages/lambda/src/mail-handler.ts` and `packages/lambda/src/viewer-handler.ts`; the Construct must reference the compiled `lib` asset rather than inline code.
- The viewer function serves `packages/viewer` and answers the same `/api` contract as `packages/local`. Changing a response shape means changing all three.
- The Lambda asset has no `node_modules`. Anything the handlers need at run time is copied into `packages/lambda/lib` and then into the CDK package's `lib` by `scripts/copy-lambda-assets.mjs`; do not add a runtime dependency that is only resolvable through a workspace's own `node_modules`.
- Never accept viewer credentials as a plain construct property. They would land in the synthesized template; read them from a secret at run time.
- Keep the viewer refusing to be created without basic auth, an address range, IAM auth, or an explicit `allowPublicAccess`.
- Run `pnpm --filter ses-mail-catcher-lambda build`, `pnpm compile`, `pnpm test`, `pnpm lint`, and `pnpm typecheck` before handoff.
