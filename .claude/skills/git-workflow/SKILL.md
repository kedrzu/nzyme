---
name: git-workflow
description: >-
    How a change moves through nzyme's git: branch naming, Conventional Commit messages, pushing,
    opening and readying PRs, hotfixes on the release lines, and landing. Use before committing,
    pushing or opening a PR in this repo, and when choosing the base branch for a fix. This is the dev
    plugin's `git-workflow` contract (start, checkpoint, publish, stack, land).
---

# Git workflow

Commit messages and PR titles drive the release: `nx release` computes the next version and the
changelog from Conventional Commits, and PRs are squash-merged, so **the PR title becomes the commit**.
`pr-title.yml` rejects a title that is not a Conventional Commit.

- Format: `<type>(<scope>): <summary>` — English, imperative, lowercase summary, no trailing period.
- Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`. Only
  `feat`, `fix` and `perf` (and breaking changes) produce a release.
- Scope: the package name without `@nzyme/` (`feat(vue-forms): …`); omit it for repo-wide changes.
- Breaking change: `!` after the scope (`feat(pulumi)!: …`) plus a `BREAKING CHANGE:` footer saying
  what consumers must change. While the version is 0.x it bumps the minor.
- Never edit `version` fields or `CHANGELOG.md` by hand — the release PR does.

## Start

Pick the base by where the change has to land:

|Change|Base branch|
|-|-|
|Feature, refactor, anything not urgent|`main`|
|Fix that must reach npm without what is on `main`|`release`|
|Fix a product needs in production now|`<consumer>/release` (e.g. `healed/release`)|

Branch name: `<type>/<short-kebab-slug>` from the chosen base (`git switch -c fix/money-rounding
origin/release`). Opening a draft PR early is optional.

## Checkpoint

Commit in the format above and push (`git push -u origin HEAD`). Before pushing code-impacting work,
the scoped checks from the `verify` skill must be green. Confirm the push landed:
`git rev-parse HEAD` equals `git rev-parse @{u}`.

## Publish

`gh pr create --base <base> --title "<conventional title>" --body-file <file>` (or `gh pr ready` for a
draft). The body says what changed and why, in English; the dev pipeline supplies its text. CI
(`ci.yml`) must be green. There is no issue tracker integration in this repo.

## Stack

Not supported in this repository: one PR per change. When a change must be split, land the lower part
first and branch the next from the updated base.

## Land

Only on the user's request — merging is outward-facing:

- Normal PRs: `gh pr merge <n> --squash` (the title becomes the commit).
- Forward-port PRs (`<consumer>/release → main`) and the back-merge PR (`release → main`): **merge
  commit**, never squash — the release-line commits must become ancestors of `main`, otherwise later
  fast-forwards of those lines fail.

What happens after landing, for orientation:

- `main` → nothing is published. A maintainer runs **Promote main to release** (`promote.yml`) when it
  should ship.
- `release` → `release.yml` opens or updates the release PR `chore(release): vX`; merging it publishes
  to npm, tags and creates the GitHub Release. `back-merge.yml` merges `release` back into `main`.
- `<consumer>/release` → `forward-port.yml` opens the forward-port PR to `main`.
