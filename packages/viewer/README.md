# ses-mail-catcher-viewer

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
pnpm --filter ses-mail-catcher-viewer dev
```

Point the proxy somewhere else with `SES_MAIL_CATCHER_URL`:

```sh
SES_MAIL_CATCHER_URL=http://127.0.0.1:9000 pnpm --filter ses-mail-catcher-viewer dev
```

A built bundle can also be aimed at another backend at runtime with the `api`
query parameter, for example `http://127.0.0.1:8005/?api=http://other-host/api/`.

## The API it expects

Any backend that wants to reuse this viewer has to answer these routes. The
shapes live in [`src/types.ts`](./src/types.ts).

| Route | Response |
| --- | --- |
| `GET /api/messages?mailbox=&limit=` | `{ messages, mailboxes }` |
| `GET /api/messages/:id` | message with `content.text`, `content.html`, `content.attachments` |
| `GET /api/messages/:id/raw` | `message/rfc822` |
| `GET /api/messages/:id/attachments/:index` | the attachment bytes |
| `GET /api/health` | `{ status: 'ok' }` |

## Rendering untrusted mail

Captured messages are untrusted input. HTML bodies render inside an iframe with
an empty `sandbox` attribute, which denies scripts, forms, popups and
same-origin access to the viewer. Remote images referenced by a message are
still loaded by the browser, so a message can observe that it was opened.
