# Viewer package instructions

This package is a React + Vite single page app. It is bundled into
`packages/local` rather than published, so treat its build output as an asset of
that package.

- Keep relative imports explicit with `.js` suffixes; the repository is
  ESM-first and TypeScript resolves them through NodeNext.
- Keep the bundle backend-agnostic. `src/types.ts` is the contract; a change
  there has to be matched in every backend that serves `/api`.
- Keep `base: './'` in the Vite config. The bundle has to work from any path
  prefix, because it is served by more than one host.
- Render message HTML only inside the sandboxed iframe in `HtmlPreview`.
  Captured mail is untrusted input and must never run in the viewer's origin.
- The lint config in this package enables the react plugin and turns off
  `react/react-in-jsx-scope`, because the automatic JSX runtime is used.
- Tests cover pure logic under `test/`. There is no DOM test environment here;
  behaviour that needs a server is covered by `packages/local` tests instead.
