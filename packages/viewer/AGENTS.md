# Viewer package instructions

This package is a React + Vite single page app. It is bundled into
`packages/local` rather than published, so treat its build output as an asset of
that package.

- Keep relative imports explicit with `.js` suffixes; the repository is
  ESM-first and TypeScript resolves them through NodeNext.
- Keep the bundle backend-agnostic. `packages/api-contract/src/index.ts` is the
  contract source; a change there has to be matched in every backend that
  serves `/api`. `src/types.ts` re-exports the viewer-facing types.
- Keep `base: './'` in the Vite config. The bundle has to work from any path
  prefix, because it is served by more than one host.
- Render message HTML only inside the sandboxed iframe in `HtmlPreview`.
  Captured mail is untrusted input and must never run in the viewer's origin.
  `rewriteCidReferences` (`src/cid.ts`) rewrites `cid:` references to the
  matching attachment's URL before the HTML reaches the iframe's `srcDoc` —
  it is a pure string rewrite and must never relax the iframe's empty
  `sandbox` attribute or otherwise change how the HTML is rendered.
- Link extraction for the detail pane's Links tab (`src/links.ts`) parses
  the HTML part with `DOMParser` into a detached document that is never
  inserted into the page (`document.body.appendChild`, etc.) — it only reads
  attribute/text values back out of it. Keep it that way; inserting
  untrusted mail HTML into the real DOM, even briefly, defeats the sandbox
  above.
- Server state goes through TanStack Query (`src/queries.ts`), not
  hand-written `useEffect`/`AbortController` fetching. Add new reads as
  `queryOptions` factories and new writes as mutation hooks there, keyed
  under `['messages']` / `['messages', id]` / `['messages', id, 'raw']` /
  `['health']`.
- Navigation goes through TanStack Router on a hash history (`src/router.tsx`),
  so the bundle keeps working from a static file server. Route search params
  (`tab`, `q`) are validated with `zod`. Every navigation builds `{ tab, q }`
  explicitly (`buildSearch` in `src/router.tsx`) instead of spreading the
  previous search object — hash history folds the real `location.search`
  (e.g. a `?api=` override) into the parsed location, so spreading `prev`
  would leak it into the hash. `src/App.tsx` stays presentational — it takes
  data and callbacks as props instead of reading the router or query cache
  itself — while `src/router.tsx` owns the hooks that wire routing and data
  together and pass the results down.
- UI primitives come from [react-aria-components](https://react-spectrum.adobe.com/react-aria/index.html)
  (`GridList`, `Tabs`, `SearchField`, `Switch`, `DialogTrigger`/`Modal`/`Dialog`,
  etc.), not hand-rolled `<button role="tab">`-style markup — they carry
  correct ARIA and keyboard behavior for free. Style them via the `className`
  prop and the `data-*` state attributes each one documents (`[data-selected]`,
  `[data-focus-visible]`, `[data-disabled]`, ...), not by copying their
  default class names.
  - **Dynamic collections** (`GridList items={...}`, `Tabs`, etc.) cache each
    item's rendered output keyed by item identity, and do not know that the
    render function's closure also depends on outside values (a callback
    prop, a `Set` used for a per-row marker, ...). Pass those in via the
    `dependencies` prop, or a row's handlers/markers get frozen at whatever
    they were on that item's first render and never update again — this bit
    `MessageList`'s row delete button and "new" marker once before
    `dependencies` was added.
- Toasts go through [sonner](https://sonner.emilkowal.ski/): one `<Toaster/>`
  at the root (`src/main.tsx`), `toast.success`/`toast.error` from mutation
  callbacks. Theme it via a `style` prop carrying its `--normal-*`/
  `--success-*`/`--error-*` CSS custom properties (see
  `src/toaster-theme.ts`) rather than a plain stylesheet rule — sonner
  declares those same variables scoped to `[data-sonner-toaster]` in its own
  injected stylesheet, which beats a bare `:root` override regardless of
  source order. Browser tests must call `toast.dismiss()` in their shared
  `afterEach` (see `test/browser-setup.ts`): sonner's toast queue is
  module-level state, independent of any particular `<Toaster>` mount, so a
  toast fired in one test and not yet auto-dismissed reappears under the
  next test's fresh `<Toaster>`.
- The lint config in this package enables the react plugin and turns off
  `react/react-in-jsx-scope`, because the automatic JSX runtime is used.
- Tests run as two Vitest projects, configured in `vitest.config.mts`: `unit`
  (Node environment, `test/**/*.test.ts`, MSW via `msw/node`) for pure logic,
  and `browser` (Vitest Browser Mode, Playwright + Chromium,
  `test/**/*.browser.test.tsx`, MSW via `msw/browser`) for characterization
  tests that render the app and assert on the real DOM. `pnpm test` runs both.
  Browser tests need Chromium installed once via
  `pnpm exec playwright install chromium`.
