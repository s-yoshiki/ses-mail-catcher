# Oxlint と Oxfmt による lint・format

- Status: Accepted
- Date: 2026-11-15
- Supersedes: なし

## Context

ses-mail-catcher の Node.js / TypeScript workspace で lint、format、依存バージョンの扱いを統一する。

## Decision

- TypeScript / JavaScript の lint に Oxlint、format に Oxfmt を使う。
- 共有設定を `configs/oxlint` と `configs/oxfmt` に置く。
- 依存バージョンは pnpm catalog で管理する。
- Node.js 26 と pnpm 12 を CI とローカル開発の基準にする。

## Consequences

- 既存ファイルを Oxfmt の設定に合わせて整形する。
- lint と format の確認を CI の検証入口に加える。
