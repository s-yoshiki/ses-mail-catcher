# cdk-ses-mail-catcher

[![View on Construct Hub](https://constructs.dev/badge?package=cdk-ses-mail-catcher)](https://constructs.dev/packages/cdk-ses-mail-catcher)

An AWS CDK Construct Library for building an environment that catches emails
sent through Amazon SES instead of delivering them to real recipients.

This repository is the initial TypeScript/jsii scaffold. The mail relay,
captured-message storage, and viewer will be added incrementally while keeping
the construct library compatible with the AWS CDK ecosystem.

## Usage

```ts
import { Stack } from "aws-cdk-lib";
import { SesMailCatcher } from "cdk-ses-mail-catcher";

const stack = new Stack();
new SesMailCatcher(stack, "MailCatcher");
```

## Development

```sh
pnpm install
pnpm test
pnpm build
```

Generated project files are managed by [projen](https://github.com/projen/projen).
Edit `.projenrc.ts` and run `pnpm exec projen` when changing project settings.

## Publishing

The repository includes projen's release workflow for publishing public npm
packages. Configure the `NPM_TOKEN` GitHub Actions secret before publishing a
release. Public jsii-compatible packages with a recognized CDK keyword are
automatically discoverable by Construct Hub after they are published to npm.
