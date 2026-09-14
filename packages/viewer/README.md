# @ses-mail-catcher/viewer

React viewer for messages captured by ses-mail-catcher.

The bundle is not published on its own. `packages/local` copies the build output
into its own `lib/viewer` directory and serves it from the same port as the API,
so `http://127.0.0.1:8005/` shows the UI and `http://127.0.0.1:8005/api/...`
answers the requests behind it.

## Develop

Run the local server in one terminal and the Vite dev server in another. Vite
proxies `/api` to the server, so the UI reloads without rebuilding the backend.

```sh
node packages/local/lib/cli.js
pnpm --filter @ses-mail-catcher/viewer dev
```

Point the proxy somewhere else with `SES_MAIL_CATCHER_URL`:

```sh
SES_MAIL_CATCHER_URL=http://127.0.0.1:9000 pnpm --filter @ses-mail-catcher/viewer dev
```

To run the viewer without a local backend, enable the MSW browser mock:

```sh
VITE_ENABLE_MOCKS=true pnpm --filter @ses-mail-catcher/viewer dev
```

The mock data is in [`src/mocks/data.ts`](./src/mocks/data.ts), and the same
handlers are used by the Vitest tests. [`src/mocks/store.ts`](./src/mocks/store.ts)
wraps that seed data in a mutable, resettable store that the handlers read
from, so a later phase can add mutating routes (for example DELETE) without
changing how the seed data is authored.

A built bundle can also be aimed at another backend at runtime with the `api`
query parameter, for example `http://127.0.0.1:8005/?api=http://other-host/api/`.

## Routing

Navigation is client-side, via [TanStack Router](https://tanstack.com/router)
on a hash history (see [`src/router.tsx`](./src/router.tsx)), so the app works
from a static file server with no server-side rewrite rules. The selected
message and detail tab live in the URL after the `#`:

```
http://127.0.0.1:8005/#/messages/<id>?tab=raw
```

- `/` — no message selected.
- `/messages/:id` — that message's detail pane. `tab` picks `html`, `text`,
  `attachments`, `links` or `raw` (default: `html` if the message has an HTML
  part, otherwise `text`); `q` is the search query, so a search stays intact
  across selecting a message, switching tabs, or reloading the page.

Every navigation writes only `tab` and `q` into the hash search (never the
whole previous search object), because hash history folds the real
`location.search` — the `?api=` override below — into the parsed location,
and spreading it back out would leak it into the hash.

Because routing lives in the hash, the real `location.search` (before the
`#`) is untouched by navigation, so the `?api=` override above keeps working
on any route, for example
`http://127.0.0.1:8005/?api=http://other-host/api/#/messages/<id>`.

## Search

The toolbar's search field filters the message list case-insensitively over
the subject, sender, and To/Cc recipients (`src/filter.ts`); Bcc is excluded,
since it is never shown to other recipients. The toolbar count switches to
`filtered / total` while a query is active, and the list shows a dedicated
empty state when nothing matches.

## Detail pane

Header rows (`From`, `To`, `Cc`, `Bcc`, `Reply-To`) each have a copy button
(`navigator.clipboard.writeText`, confirmed with a toast); a recipient list
longer than three collapses behind a "+N more" toggle. "Download .eml" and
the delete button sit in an action bar above the tabs, not inside the
tablist itself. The header/headers/tabs stay fixed as you switch tabs; only
the active tab panel scrolls.

### HTML preview

The HTML tab renders the message body inside a sandboxed iframe
(`src/components/HtmlPreview.tsx`). Before it reaches the iframe's `srcDoc`,
`cid:` references in `src`/`background` attributes and CSS `url(...)` are
rewritten to the matching attachment's URL by `rewriteCidReferences`
(`src/cid.ts`) — real backends report an attachment's `contentId` with
surrounding angle brackets (e.g. `"<logo@example>"`), matching
[`postal-mime`](https://github.com/postalsys/postal-mime)'s own format,
while the HTML references it without them (`cid:logo@example`); the
rewriter strips brackets from either side, URL-decodes the reference, and
compares case-insensitively. A reference with no matching attachment is
left unchanged. This never relaxes the sandbox — it only edits the HTML
string beforehand.

A "Desktop" / "Mobile" toggle above the frame narrows it to 375px,
centered, for a quick mobile preview; the choice is persisted to
`localStorage` and the toggle itself is hidden below the narrow-screen
breakpoint (see [Narrow layout](#narrow-layout)), where the frame already
fills the only available width. The frame keeps a white background
regardless of theme (mail assumes a light background) with a border that
stays visible in dark mode.

### Attachments tab

Each attachment shows a small inline type icon (image / PDF / audio / video
/ archive / text / generic — `src/components/attachment-icons.tsx`, no icon
library), filename, content type, size, an "Inline" badge when applicable,
and a download link. Raster image types (`image/png`, `image/jpeg`,
`image/gif`, `image/webp`, `image/avif`, `image/bmp`) also get a lazy-loaded
thumbnail; other image types (e.g. `image/svg+xml`) do not, since an inline
SVG is scriptable and should not be trusted with a preview outside the
sandboxed HTML iframe.

### Raw tab

Split into a "Headers" table and the full "Source". `parseRawHeaders`
(`src/raw-message.ts`) splits the raw `message/rfc822` text at the first
blank line, unfolds RFC 5322 continuation lines, and decodes RFC 2047
encoded-words (`=?charset?B?...?=` / `=?charset?Q?...?=`) for display,
falling back to the original text for a word that fails to decode. The
Source view below shows the raw text unmodified, with a wrap on/off toggle
(persisted to `localStorage`) and a copy button.

### Links tab

Lists every unique `http:`/`https:` URL found in the message: `href`s from
the HTML part plus any bare URL in its text, and bare URLs in the plain
text part (`src/links.ts`). The HTML is parsed with `DOMParser` into a
detached document that is never inserted into the page, so extraction never
executes scripts or loads resources from the untrusted message. Other
schemes (`javascript:`, `data:`, `mailto:`, ...) are excluded. Each link has
a copy button and an "Open" link (`target="_blank" rel="noopener
noreferrer"`); the tab's label shows the count and the tab is disabled when
there are none.

## Narrow layout

Below 720px (the same breakpoint the desktop/mobile CSS already used), the
app shows one pane at a time instead of the list and detail side by side
(`useMediaQuery` in `src/useMediaQuery.ts` drives this structurally; plain
CSS media queries handle the rest): `/` shows only the list, and
`/messages/:id` shows only the detail pane, with a "← Back" button that
returns to `/` while keeping the search query (`q`) in the URL.

The toolbar also collapses: the title and search stay on the first row, and
Auto refresh, Refresh, Delete all, and Keyboard shortcuts move into an
overflow menu (an RAC `MenuTrigger`). The delete-all confirmation dialog and
the keyboard-shortcuts dialog still open the same way from that menu, since
their `isOpen` state is controlled by the root route regardless of which
control triggers it.

Interactive controls keep at least a 40px touch target on narrow screens,
long addresses wrap instead of overflowing, and the preview width toggle
(see [HTML preview](#html-preview)) is hidden, since the viewport itself is
already narrow. Each message row's delete button is hover-only on devices
that support hover (`@media (hover: hover)`) — visible when the row is
hovered, focused-within, or selected — and always visible on touch devices
(`(hover: none)`); it stays reachable by keyboard either way.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `j` / `k` | Select the next / previous message |
| `/` | Focus the search field |
| `r` | Refresh the message list |
| `Delete` | Delete the selected message (when delete is supported) |
| `Escape` | Clear the search field if it is focused, otherwise return to `/` |
| `?` | Open the keyboard shortcuts help dialog |

Shortcuts are ignored while Ctrl, Meta, or Alt is held, and while typing in a
text field — except `Escape` on the search field itself, which clears it.
They are also suspended while a dialog (delete-all, shortcuts help) is open.

## Delete

Every delete control — the row's own button, the detail pane's "Delete"
button, the `Delete` shortcut, and the toolbar's "Delete all" — only appears
once `GET /api/health` reports `features.delete: true`; a backend without
delete support never shows any of them.

Deleting the message currently open first navigates to the next message in
the filtered list (or the previous one, or `/` if it was the only one
visible), so its detail query is never refetched into a "not found" flash,
and only then sends the request. A success toast confirms the delete; a
failed request rolls the list back to what it was and shows an error toast.
"Delete all" opens a confirmation dialog (`Cancel` has initial focus) and, on
confirmation, repeats `DELETE /api/messages` until the backend reports
`hasMore: false`, then navigates to `/` and toasts the count removed.

## Test

Tests run as two Vitest projects (see [`vitest.config.mts`](./vitest.config.mts)):

- `unit` — Node environment, `test/**/*.test.ts`, MSW via `msw/node`. Covers
  pure logic such as `src/api.ts` and `src/format.ts`.
- `browser` — [Vitest Browser Mode](https://vitest.dev/guide/browser/) on
  Chromium via Playwright, `test/**/*.browser.test.tsx`, MSW via
  `msw/browser`. Renders `App` with [`vitest-browser-react`](https://github.com/vitest-community/vitest-browser-react)
  and asserts against the real DOM, including an axe-core accessibility check
  (see [`test/support/axe.ts`](./test/support/axe.ts)).

Playwright needs Chromium installed once per machine:

```sh
pnpm --filter @ses-mail-catcher/viewer exec playwright install chromium
```

Then run both projects:

```sh
pnpm --filter @ses-mail-catcher/viewer test
```

## The API it expects

Any backend that wants to reuse this viewer has to answer these routes. The
Shapes and their Zod schemas live in
[`packages/api-contract/src/index.ts`](../api-contract/src/index.ts). The local
`src/types.ts` file re-exports the viewer types for compatibility.

| Route | Response |
| --- | --- |
| `GET /api/messages?limit=` | `{ messages }` |
| `GET /api/messages/:id` | message with `content.text`, `content.html`, `content.attachments` |
| `GET /api/messages/:id/raw` | `message/rfc822` |
| `GET /api/messages/:id/attachments/:index` | the attachment bytes |
| `DELETE /api/messages/:id` | `204` empty, or `404 { message }` when the id does not exist |
| `DELETE /api/messages` | `{ deletedCount, hasMore }` — repeat the call while `hasMore` is `true` |
| `GET /api/health` | `{ status: 'ok', features?: { delete: boolean } }` |

A backend without delete support answers both `DELETE` routes with
`405 { message }` and either omits `features` or sets `features.delete:
false` — every delete control in the UI is hidden in that case (see
[Delete](#delete) above). The client methods and TanStack Query mutation
hooks live in [`src/queries.ts`](./src/queries.ts) (`useDeleteMessage`,
`useDeleteAllMessages`); `useDeleteAllMessages` stops with an error, instead
of looping forever, if a round reports `hasMore: true` with `deletedCount:
0`, or after 100 rounds.

## Rendering untrusted mail

Captured messages are untrusted input. HTML bodies render inside an iframe with
an empty `sandbox` attribute, which denies scripts, forms, popups and
same-origin access to the viewer. Remote images referenced by a message are
still loaded by the browser, so a message can observe that it was opened.
