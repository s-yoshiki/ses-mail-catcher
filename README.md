# cdk-ses-mail-catcher

pnpm + Turborepo monorepo for the `cdk-ses-mail-catcher` AWS CDK construct library.

## Development

```sh
pnpm install
pnpm test
pnpm build
pnpm lint
pnpm typecheck
```

`pnpm lint` runs oxlint through Turborepo. The repository uses oxlint as its
only linter; ESLint is not installed.

Run a command for one workspace package with pnpm filters:

```sh
pnpm --filter cdk-ses-mail-catcher test
pnpm --filter cdk-ses-mail-catcher build
```

The library lives in [`packages/cdk-ses-mail-catcher`](./packages/cdk-ses-mail-catcher). Its generated project files are managed by [projen](https://github.com/projen/projen):

```sh
pnpm --filter cdk-ses-mail-catcher projen
```
