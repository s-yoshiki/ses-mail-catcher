# ses-mail-catcher

[English](./README.md)

Amazon SES から送信されるメールを、開発・テストの用途に応じてローカルまたは AWS 上で捕捉するモノレポです。

ESM-first の Node.js / TypeScript monorepo として管理しています。リポジトリの開発基準は Node.js 24 と pnpm 11.25.0 です。

| パッケージ | 用途 | 保存先・実行環境 |
| --- | --- | --- |
| [`@s-yoshiki/cdk-ses-mail-catcher`](./packages/cdk) | SES SDK のリクエストを捕捉する AWS Serverless 版の CDK Construct | API Gateway + Lambda + S3 + DynamoDB |
| [`@ses-mail-catcher/local`](./packages/local) | 開発・統合テスト用のローカル SES v2 互換サーバー | 非公開 workspace、Docker で配布 |
| [`@ses-mail-catcher/viewer`](./packages/viewer) | 捕捉したメールを読む React ビューア | 非公開 workspace、ローカルサーバーと AWS viewer に同梱 |
| [`@ses-mail-catcher/api-contract`](./packages/api-contract) | viewer API の共有 TypeScript 型と Zod スキーマ | 非公開 workspace |
| [`@ses-mail-catcher/cdk-mail-handler`](./packages/cdk-lambda-mail-handler) | CDK Construct が利用するメール Lambda ハンドラー | 非公開 workspace |
| [`@ses-mail-catcher/cdk-viewer-handler`](./packages/cdk-lambda-viewer-handler) | CDK Construct が利用する viewer Lambda ハンドラー | 非公開 workspace |

## 開発

依存関係のインストールと一通りの検証は、リポジトリのルートから実行します。

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

パッケージ単位で実行する場合:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher compile
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
pnpm --filter @ses-mail-catcher/cdk-mail-handler test
pnpm --filter @ses-mail-catcher/cdk-viewer-handler test
pnpm --filter @ses-mail-catcher/local build
pnpm --filter @ses-mail-catcher/local test
pnpm --filter @ses-mail-catcher/viewer dev
```

ローカルサーバーとビューアを扱う場合は、リポジトリのルートからビルドしてください。Turborepo がビューアを先にビルドし、その成果物をローカルサーバーが `packages/local/lib/viewer` にコピーします。ローカルパッケージだけをビルドした場合も、サーバーは API 専用サービスとして動作します。

## ローカル SES サーバー

ローカルサーバーをビルドして起動します。

```sh
pnpm build
node packages/local/lib/cli.js
```

ブラウザで <http://127.0.0.1:8005/> を開くと、同梱されたビューアを利用できます。デフォルトでは `127.0.0.1:8005` で SES v2 の `SendEmail` と `SendRawEmail` を受け付けます。

待ち受けアドレスとポートは、`SES_MAIL_CATCHER_HOST` / `SES_MAIL_CATCHER_PORT` または `--host` / `--port` で変更できます。メールはデフォルトで OS のキャッシュディレクトリ内の SQLite に保存されます。保存先を固定または永続化したい場合は `SES_MAIL_CATCHER_DB_PATH` または `--db-path` を指定してください。

```sh
ses-mail-catcher --port 8005 --db-path ./tmp/mailbox.sqlite3
```

AWS SDK for JavaScript v3 の SES v2 クライアントから、ローカルのエンドポイントとダミー認証情報を指定して利用できます。

```ts
const ses = new SESv2Client({
  endpoint: 'http://127.0.0.1:8005',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
```

Docker イメージも作成できます。

```sh
docker build -f packages/local/Dockerfile -t ses-mail-catcher-local .
docker run --rm -p 8005:8005 \
  -v "$PWD/.ses-mail-catcher:/data" \
  ses-mail-catcher-local
```

イメージは `0.0.0.0` でバインドするため、公開したポートからコンテナへ接続できます。API のルート、データベースの保存先、実験的なネイティブバイナリについては [`packages/local/README.md`](./packages/local/README.md) を参照してください。

## AWS Serverless 版

CDK パッケージは capture 専用のバックエンドを作成します。`api-mail` は API Gateway + Lambda で、SES v1 Query 形式を `/` で、SES v2 JSON の `SendEmail` を `/v2/email/outbound-emails` で受け取ります。Simple メッセージは MIME に変換し、Raw メッセージは保持したまま、S3 と DynamoDB に保存します。Lambda に SES 権限は付与しません。

```ts
import { Duration } from 'aws-cdk-lib';
import { SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

const mailCatcher = new SesMailCatcher(stack, 'MailCatcher', {
  retention: Duration.days(7),
  mailApi: { allowedIpCidrs: ['203.0.113.0/24'] },
  viewer: { allowedIpCidrs: ['203.0.113.0/24'] },
});
```

AWS SDK SES クライアントの endpoint には `mailCatcher.mailApiEndpoint` を指定します。必要な場合は `mailApi.authorization` に `AWS_IAM` を指定し、送信元 Principal に `mailCatcher.grantMailApiInvoke()` で API 呼び出し権限を付与できます。`mailApi` の IP 制限には API Gateway の resource policy を使用します。

`api-viewer` は API Gateway + Lambda + Hono、`web-viewer` は非公開 S3 から配信する React アプリです。CloudFront で両方を同一オリジンとして配信します。viewer はデフォルトで作成され、`viewer.allowedIpCidrs` を省略した場合は、開発用途として組み込み CloudFront Function が IPv4/IPv6 のすべての範囲（`0.0.0.0/0` と `::/0`）を許可します。捕捉した HTML はサンドボックス化された iframe 内で表示します。独自の `cloudfront.IFunction` を `viewer.edgeFunction` に渡して、CloudFront のエッジ処理をアプリケーション側で管理することもできます。この場合、アクセス制御と SPA の rewrite は渡した Function 側で実装します。
Basic 認証を利用する場合は CloudFront KeyValueStore を指定できます。KeyValueStore には `Basic ` prefix を含む期待する `Authorization` ヘッダー値を保存し、認証情報自体は CDK の template の外で管理します。IP 制限と Basic 認証は組み合わせて利用できます。

viewer はデフォルトで、捕捉したメールを 1 件または全件削除できます。Lambda には message テーブルへの `dynamodb:DeleteItem` / `dynamodb:BatchWriteItem` と、ストレージバケットへの S3 削除権限が付与され、DELETE リクエストはクロスオリジン呼び出しから保護されます。`viewer.allowDelete: false` を指定すると viewer API は読み取り専用のままになり、これらの権限は付与されず、`/api/*` の CloudFront ビヘイビアも GET と HEAD のみに制限されます。

Construct API、viewer の設定、IAM 権限、公開方法の詳細は [`packages/cdk/README.md`](./packages/cdk/README.md) を参照してください。

## ドキュメント

- [アーキテクチャ](./docs/architecture.md)
- [開発ガイド](./docs/development.md)
- [ブランチ運用戦略](./docs/branching-strategy.md)
- [リリースガイド](./docs/release.md)
- [デプロイ可能な CDK サンプル](./examples/cdk/README.md)
- [AWS SDK でメールを送信するサンプル](./examples/sdk/README.md)
- [ローカルサーバー](./packages/local/README.md)
- [AWS CDK Construct](./packages/cdk/README.md)
- [CDK メール Lambda ワークスペース](./packages/cdk-lambda-mail-handler/README.md)
- [CDK viewer Lambda ワークスペース](./packages/cdk-lambda-viewer-handler/README.md)
- [React ビューア](./packages/viewer/README.md)

## Projen

CDK パッケージの生成ファイルは [projen](https://github.com/projen/projen) で管理しています。CDK プロジェクトの設定を変更する場合は `packages/cdk/.projenrc.ts` を編集し、次のコマンドでファイルを再生成してください。

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher projen
```
