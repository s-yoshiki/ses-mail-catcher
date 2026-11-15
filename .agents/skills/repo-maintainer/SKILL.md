---
name: repo-maintainer
description: Maintain ses-mail-catcher workspace configuration, documentation, and checks.
---

# Repository Maintainer

## Workflow

1. Read the repository guide and the nearest code or config before editing.
2. Keep shared tool configuration in `configs/oxlint/` and `configs/oxfmt/`.
3. Put shared dependency versions in the pnpm catalog.
4. Record technical decisions in `docs/adr/` and update its index.
5. Preserve generated files and unrelated changes.

## Validation

Run `pnpm verify` before hand-off. Report each command and result exactly. Do not run deploy or infrastructure mutation commands during validation.
