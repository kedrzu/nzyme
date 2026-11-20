# Release from main on demand

## Status

Accepted. Supersedes [release-line-on-nx-release.md](release-line-on-nx-release.md).

## Context

The release line (`release-line-on-nx-release.md`) kept a separate `release` branch so that a fix could
reach npm while `main` held unreleased breaking work. Hotfixes went to `release`, `promote.yml` merged
`main` into it, a release PR carried the bump, and `back-merge.yml` merged `release` back into `main`.

In practice that line was almost never needed:

- Products build nzyme from a submodule pin they own (`product-owned-submodule-pins.md`); the line
  never served them.
- At 0.x every breaking change bumps only the minor, and releases are frequent, so waiting for the next
  release costs little. One fix in the line's lifetime went to `release` on its own (#221).
- Its cost was steady: two extra workflows, back-merge conflicts that had to land by a manual
  fast-forward, base detection in `setup.sh`, and a hotfix path in `git-workflow`.

## Options Considered

- **Option A — keep the release line.** Trade-off: all of the above, for a hotfix path used once.
- **Option B — release PR against `main`.** Trade-off: a bot PR that has to be kept up to date on every
  push, so that a maintainer can merge it; triggering the release by hand is the same decision with less
  glue.
- **Option C — a manual workflow on `main`.** Trade-off: the version and changelog are not reviewed
  before publishing; they are computed from the PR titles that were already reviewed.

## Decision

Option C.

- Every change, hotfixes included, is a PR to `main`.
- `release.yml` runs only on `workflow_dispatch`. It computes the next version and changelog with
  `nx release` (`git log vX..HEAD`), commits `chore(release): vX` to `main` with the workflow token,
  then builds, tests, publishes, tags and creates the GitHub Release from that commit.
- A run that finds the current version untagged publishes the existing release commit instead of
  bumping again, so a failed publish is fixed by re-running the workflow.
- `promote.yml`, `back-merge.yml` and the `release` branch are removed.

## Consequences

- **Gained:** one long-lived branch; no promotion, back-merge or release PR glue; `setup.sh` always
  catches up with `main`.
- **Accepted:**
  - A fix cannot reach npm without what is already on `main`. If that is ever needed, cut a branch from
    the last tag and publish from it by hand.
  - The workflow token must be allowed to push to `main` (the `main branch` ruleset only blocks
    deletion and force-push), or a `RELEASE_BOT_TOKEN` must be provided.
  - A push to `main` made with the workflow token does not trigger CI; the publish job builds and tests
    the release commit itself.
