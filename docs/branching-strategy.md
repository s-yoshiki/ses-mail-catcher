# Branching strategy

This repository uses a small Git Flow with `main`, `develop`, and short-lived
topic branches.

## Branch roles

| Branch | Purpose | Release behavior |
| --- | --- | --- |
| `main` | Production and published code | A push to `main` runs the Projen release workflow. If there are releasable commits, it creates the version tag, changelog, GitHub Release, and npm publication. |
| `develop` | Integration branch for the next release | CI runs after merges, but no package is published. |
| `feature/*`, `fix/*`, `refactor/*`, `chore/*`, `docs/*`, `deps/*` | Short-lived work branches | Merged into `develop` through a pull request. |
| `hotfix/*` | Urgent fixes based on the published `main` | Merged into `main` first, then synchronized back to `develop`. |

The default repository branch remains `main`. Normal development pull requests
target `develop`; only release pull requests, hotfixes, and branch
synchronization pull requests target `main`.

## Normal development

Create a branch from the latest `develop`:

```sh
git switch develop
git pull --ff-only
git switch -c feat/message-search
```

Open a pull request from the topic branch to `develop`. The pull request must
pass the build workflow, which runs linting, type checking, tests, and builds.
Use squash merging so `develop` records one logical commit per pull request.

Keep topic branches short-lived. If `develop` advances while work is in
progress, update the topic branch before merging:

```sh
git fetch origin
git rebase origin/develop
```

Do not commit directly to `develop` or `main`.

## Normal release

When the changes in `develop` are ready to publish:

1. Run the complete verification suite on `develop`.
2. Open a release pull request from `develop` to `main`, using a title such as
   `chore(release): publish the next version`.
3. Merge the release pull request after the required checks pass.
4. The push to `main` starts the existing Projen release workflow. It calculates
   the next version from conventional commits, creates the tag and changelog,
   publishes the GitHub Release, and publishes the CDK package to npm.
5. Synchronize `main` back into `develop` if the release workflow changed
   generated release files.

`develop` merges do not publish packages. A release is intentional: it happens
when a release pull request is merged into `main`.

Version intent follows conventional commits:

- `fix`: patch release, for example `0.2.0` → `0.2.1`
- `feat`: minor release, for example `0.2.0` → `0.3.0`
- `BREAKING CHANGE`: major release when applicable
- `docs`, `chore`, `refactor`, and `test`: no release by themselves

The package is managed by Projen. Do not hand-edit generated package metadata
just to prepare a release; use the release workflow and keep the release commit
on `main`.

## Hotfix

Start an urgent fix from the published branch:

```sh
git switch main
git pull --ff-only
git switch -c hotfix/viewer-auth
```

Open the hotfix pull request directly against `main`. After it is merged, the
main-branch release workflow publishes the next patch version. Then open a
second pull request from `main` to `develop` (or apply the same commit to
`develop`) so the fix cannot be lost in the next normal release.

The synchronization step is part of the hotfix completion criteria. Never leave
a hotfix only on `main`.

## Pull request titles

Pull request titles use Conventional Commit types. The repository currently
accepts `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`, `ci`,
`perf`, and `revert`.

Examples:

```text
feat(viewer): add message search
fix(local): preserve the explicit database path
chore(release): publish the next version
chore(sync): synchronize the hotfix back to develop
```

## Repository settings

The GitHub repository should enforce the following rules:

- protect `main` and `develop` from direct pushes;
- require pull requests and the required CI checks before merging;
- allow squash merges and delete merged topic branches;
- disallow force pushes and branch deletion for `main` and `develop`;
- require one approval when multiple maintainers are working on the repository;
- keep `main` as the default branch, because it represents the published code.

If a merge queue is enabled later, the build workflow must also run for the
`merge_group` event before that queue is made a required check.
