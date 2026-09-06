# ses-mail-catcher-api-contract

Shared API types and Zod schemas for the viewer API.

`packages/viewer`, `packages/local` and `packages/cdk` use the types from
`src/index.ts` so that the three implementations keep the same response
shapes. The viewer also uses the schemas at its HTTP boundary to reject
malformed JSON responses at runtime.

The package is source-only and private to this workspace. Keep imports from
the package type-only in server code unless the runtime schema is intentionally
needed; the CDK Lambda asset does not carry workspace `node_modules`.
