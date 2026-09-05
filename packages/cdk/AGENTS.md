# CDK package instructions

This package is generated with Projen and compiled with jsii.

- Edit `.projenrc.ts` for package metadata, dependencies, and generated settings.
- Keep package metadata scoped as `@s-yoshiki/cdk-ses-mail-catcher`.
- Keep relative imports explicit with `.js` suffixes because the package is ESM.
- Keep the Lambda handler in `src/mail-handler.ts`; the Construct must reference the compiled `lib` asset rather than inline code.
- Run `pnpm compile`, `pnpm test`, `pnpm lint`, and `pnpm typecheck` before handoff.
