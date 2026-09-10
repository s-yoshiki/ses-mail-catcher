# Repository instructions for coding agents

## Scope

This repository is an ESM-first pnpm + Turborepo monorepo for `ses-mail-catcher`.

- `packages/cdk`: the publishable `@s-yoshiki/cdk-ses-mail-catcher` AWS CDK Construct.
- `packages/cdk-lambda-mail-handler`: the private `@ses-mail-catcher/cdk-mail-handler` workspace packaged by the CDK construct.
- `packages/cdk-lambda-viewer-handler`: the private `@ses-mail-catcher/cdk-viewer-handler` workspace packaged by the CDK construct.
- `packages/local`: the private `@ses-mail-catcher/local` development server and container source.
- `packages/viewer`: the private `@ses-mail-catcher/viewer` React app, bundled into `packages/local` rather than published.
- `docs`: architecture, development, and release documentation.

## Non-negotiable design rules

- Keep TypeScript source ESM-compatible: use `module: NodeNext`, `type: module`, and explicit `.js` suffixes for relative imports.
- The CDK package must remain jsii-compatible. Public APIs in `packages/cdk/src` must use jsii-supported types and should be documented.
- Do not inline or hard-code Lambda handler source. The CDK construct must package the compiled `lib/` asset and resolve its path from the module URL.
- Keep CATCH mode free of SES permissions. Only RELAY mode may grant `ses:SendEmail` and `ses:SendRawEmail`.
- The local database is disposable cache data by default. Preserve `SES_MAIL_CATCHER_DB_PATH` and `--db-path` as explicit overrides.
- Do not add a native SQLite npm addon unless the `node:sqlite` baseline becomes impossible to support.
- Preserve the existing Lambda + S3 + DynamoDB architecture for the CDK package.
- Keep the viewer backend-agnostic. `packages/viewer/src/types.ts` is the `/api` contract; every backend that serves the viewer answers the same shapes.
- Render captured message HTML only inside a sandboxed iframe. It is untrusted input.
- The AWS viewer must not be creatable without access control, and its credentials must never reach the synthesized template.

## Commands

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Package-specific commands:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher compile
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
pnpm --filter @ses-mail-catcher/local build
pnpm --filter @ses-mail-catcher/local test
pnpm --filter @ses-mail-catcher/viewer build
pnpm --filter @ses-mail-catcher/viewer dev
```

`packages/local` serves the viewer bundle from its own `lib/viewer`, so build
from the repository root with `pnpm build` when both are involved.

When changing Projen-managed CDK settings, edit `packages/cdk/.projenrc.ts` and run:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher projen
```

Do not hand-edit generated CDK files unless the corresponding source/configuration change is also made.

## Verification expectations

- Changes to `packages/cdk` require typecheck, lint, Vitest, and jsii compile checks.
- Changes to `packages/local` require typecheck, lint, Vitest, and a build check.
- Changes to `packages/viewer` require typecheck, lint, Vitest, and a Vite build. A change to the `/api` contract also requires the corresponding `packages/local` change and tests.
- Changes to workflows, package names, or paths require `rg` checks for stale `cdk-ses-mail-catcher` paths and package filters.
- Keep documentation examples aligned with the actual package names and commands.

## Git and release

- The canonical repository is `https://github.com/s-yoshiki/ses-mail-catcher`.
- The CDK package is published as `@s-yoshiki/cdk-ses-mail-catcher`.
- The local implementation is distributed through its Dockerfile; `scriptc` native binaries remain experimental.
- Never commit `node_modules`, SQLite database files, coverage output, or local cache data.
