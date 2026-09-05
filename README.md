# ses-mail-catcher

Amazon SES の送信メールを、用途に応じてローカルまたは AWS 上で捕捉する monorepo です。

ESM-first の Node.js/TypeScript リポジトリとして管理し、Node.js 24 と pnpm 11.25.0 を基準にしています。

| パッケージ | 用途 | 保存先 |
| --- | --- | --- |
| [`@s-yoshiki/cdk-ses-mail-catcher`](./packages/cdk) | AWS Serverless 版の CDK Construct | Lambda + S3 + DynamoDB |
| [`ses-mail-catcher-local`](./packages/local) | 開発・統合テスト用のローカル SES v2 互換サーバー | SQLite |
| [`ses-mail-catcher-viewer`](./packages/viewer) | 捕捉したメールを読む React ビューア | ローカルサーバーに同梱 |

## 開発

```sh
pnpm install
pnpm test
pnpm build
pnpm lint
pnpm typecheck
```

パッケージ単位で実行する場合:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher build
pnpm --filter ses-mail-catcher-local test
pnpm --filter ses-mail-catcher-local build
pnpm --filter ses-mail-catcher-viewer dev
```

ローカルサーバーはビューアのビルド成果物を同梱するため、`pnpm build`（Turborepo がビルド順を解決します）を
使ってください。ビューア未ビルドのままサーバーだけを起動した場合は、UI なしの API のみとして動作します。

## ローカル版

```sh
pnpm build
node packages/local/lib/cli.js
```

ブラウザで `http://127.0.0.1:8005/` を開くとビューアが表示されます。ビューアはローカルサーバーに同梱され、
同じポートから配信されます。

デフォルトでは `127.0.0.1:8005` で SES v2 の `SendEmail` / `SendRawEmail` を受け付けます。
待ち受けアドレスは `SES_MAIL_CATCHER_HOST` / `SES_MAIL_CATCHER_PORT`、または `--host` / `--port` で変更できます。
メールは OS のキャッシュディレクトリにある SQLite に保存されます。保存先を固定したい場合は
`SES_MAIL_CATCHER_DB_PATH` または `--db-path` を指定してください。

Docker イメージも作成できます:

```sh
docker build -f packages/local/Dockerfile -t ses-mail-catcher-local .
docker run --rm -p 8005:8005 -v "$PWD/.ses-mail-catcher:/data" ses-mail-catcher-local
```

イメージ側は `SES_MAIL_CATCHER_HOST=0.0.0.0` を設定しています。コンテナのループバックにだけ
bind すると公開ポートから到達できないためです。

詳細は [`packages/local/README.md`](./packages/local/README.md)、ビューアについては [`packages/viewer/README.md`](./packages/viewer/README.md) を参照してください。

設計・開発・リリース方針は [`docs/architecture.md`](./docs/architecture.md)、[`docs/development.md`](./docs/development.md)、[`docs/release.md`](./docs/release.md) にまとめています。

## AWS Serverless 版

```ts
import { Duration, Stack } from 'aws-cdk-lib';
import { MailMode, SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

const stack = new Stack();
const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  retention: Duration.days(7),
  mode: MailMode.CATCH,
});
```

`CATCH` mode は raw MIME を S3 に保存し、検索用 metadata を DynamoDB に保存します。
`RELAY` mode は同じ MIME を SES に relay します。

CDK パッケージの詳細は [`packages/cdk/README.md`](./packages/cdk/README.md) を参照してください。

## Projen

CDK パッケージの生成ファイルは [projen](https://github.com/projen/projen) で管理しています。
設定を変更した場合は次を実行します:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher projen
```
