# @ses-mail-catcher/api-contract

Shared API types and Zod schemas for the viewer API.

`packages/viewer`, `packages/local` and `packages/cdk` use the types from
`src/index.ts` so that the three implementations keep the same response
shapes. The viewer also uses the schemas at its HTTP boundary to reject
malformed JSON responses at runtime.

The package is source-only and private to this workspace. Keep imports from
the package type-only in server code unless the runtime schema is intentionally
needed; the CDK Lambda asset does not carry workspace `node_modules`.

## Delete routes

Every backend that serves the viewer answers to the same delete-related
routes and shapes:

| Route | Response |
| --- | --- |
| `DELETE /api/messages/:id` | `204` with an empty body; `404 { message: 'Message not found' }` when the message does not exist |
| `DELETE /api/messages` | `200` with a `DeleteMessagesResponse` body |
| `GET /api/health` | `200` with a `HealthResponse` body, which may include `features.delete` |

`DeleteMessagesResponse` (`deleteMessagesResponseSchema`) is
`{ deletedCount: number; hasMore: boolean }`. A backend that enforces a time
budget while deleting a large mailbox may stop early and return
`hasMore: true`; clients are expected to repeat the `DELETE /api/messages`
call until a response comes back with `hasMore: false`.

`HealthResponse` (`healthResponseSchema`) stays backward compatible: existing
callers that only check `status` keep working. A backend that supports
deletion sets `features.delete: true`; a backend without delete support either
omits `features` or sets `features.delete: false`.

A backend that does not implement deletion answers `DELETE /api/messages/:id`
and `DELETE /api/messages` with `405 { message: 'Method not allowed' }` rather
than the shapes above.
