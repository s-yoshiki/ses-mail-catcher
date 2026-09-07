# Release guide

## Branch flow

Normal changes are merged into `develop` first. A release pull request from
`develop` to `main` is the release decision point. Hotfixes branch from `main`,
are merged back to `main`, and must then be synchronized into `develop`.
See the [branching strategy](./branching-strategy.md) for the complete flow.

## CDK package

The CDK package is published as `@s-yoshiki/cdk-ses-mail-catcher` from `packages/cdk`.
The Projen release workflow runs after a `main` push. It calculates the next
version from conventional commits, creates the version tag and changelog,
publishes the GitHub Release, and publishes the JavaScript package to npm.
Pushes to `develop` run CI but do not publish a package.

Before a release:

```sh
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher compile
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher test
pnpm --filter @s-yoshiki/cdk-ses-mail-catcher package
```

The npm package requires public access configuration for the `@s-yoshiki` scope and a configured Trusted Publishing/npm publishing identity in GitHub Actions.

## Local container

Build and run the local image:

```sh
docker build -f packages/local/Dockerfile -t ses-mail-catcher-local .
docker run --rm -p 8005:8005 -v "$PWD/.ses-mail-catcher:/data" ses-mail-catcher-local
```

The image stores its SQLite database at `/data/mailbox.sqlite3` through `SES_MAIL_CATCHER_DB_PATH`, and binds to `0.0.0.0` through `SES_MAIL_CATCHER_HOST` so the published port is reachable.

## Native binary

```sh
pnpm --filter @ses-mail-catcher/local build:binary
```

Native output is host-specific. Keep the Docker image and Node.js CLI as the primary distribution options until scriptc support is validated across the target platforms.
