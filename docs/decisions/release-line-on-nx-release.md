# Release line on Nx Release with a release PR

## Status

Accepted

## Context

nzyme is published to npm as `@nzyme/*` and consumed both from npm and as a git submodule. The previous
pipeline — a manual workflow that merged `main` into `release` and ran `nx release` with a long-lived
`NPM_TOKEN` — had not run since v0.14.0 (2025-04-10), and `release` had fallen 191 commits behind.

The requirements for its replacement:

- Version and changelog come from Conventional Commits, not hand-written entries.
- A small fix can be released while large or breaking work sits on `main` — so releases come from a
  separate `release` line that accepts hotfixes, and `main` is promoted into it when ready.
- Publishing uses npm trusted publishing (OIDC) with provenance, not a stored token.
- The next version and its changelog are reviewable before anything is published.

Products that consume nzyme as a submodule are not served by this line; they pin nzyme through their own
refs (`per-consumer-submodule-refs.md`).

## Options Considered

- **Option A — release-please on `release`.** A maintained release-PR bot. Trade-off: it walks history in
  `git log` (commit-date) order and stops at the last release commit. With hotfixes on `release`, a
  feature committed on `main` *before* a hotfix release but promoted *after* it is reached only after
  the walk has already stopped, so it is missing from both the changelog and the version bump.
  Reproduced on a scratch repository: feature on `main`, hotfix release on `release`, back-merge, then
  promotion — the walk ends at the hotfix release and never sees the feature.
- **Option B — release-please on `main`, linear history only.** Avoids the walk problem. Trade-off:
  gives up hotfix releases while `main` carries unreleased breaking work, which is the requirement this
  line exists for; npm hotfixes would need maintenance branches cut from tags.
- **Option C — Nx Release triggered manually, no PR.** `nx release` computes the range as
  `git log vX..HEAD`, a set difference that is correct across merges. Trade-off: nothing to review
  before publishing.
- **Option D — Nx Release with a release PR produced by a workflow.** Option C's computation, with a
  workflow that writes the version bump and changelog to a `release-pr` branch and keeps a
  `chore(release): vX` PR open against `release`; merging it publishes. Trade-off: about one workflow of
  own glue instead of a maintained bot.

## Decision

Option D.

- `promote.yml` (manual) merges `main` into `release`; hotfixes are pull requests to `release`.
- On every push to `release`, `release.yml` either prepares the release PR (the current version is
  already tagged) or publishes (the version was bumped by a merged release PR and has no tag yet):
  build, test, `scripts/publish.ts`, then the `vX` tag and the GitHub Release.
- `back-merge.yml` merges `release` back into `main` with a merge commit after every push, so fixes,
  versions and the changelog reach `main` without cherry-picks — a cherry-pick would list a fix twice.
- Versions change only on `release`, so the back-merge does not conflict on them.
- All packages share one version (a fixed Nx release group). Internal dependencies are `workspace:*`;
  `bun pm pack` rewrites them to the exact version when packing.

## Consequences

- **Gained:** correct changelogs and bumps across merges; hotfix releases that never wait for `main`; a
  reviewable release PR; no stored npm credential once trusted publishing is configured; a re-runnable
  publish (versions already on npm are skipped).
- **Accepted:**
  - The release-PR glue is ours to maintain.
  - Pushes and PRs made with the workflow token do not trigger other workflows. CI therefore does not run
    on the release PR (the publish job builds and tests anyway), and `promote.yml` calls `release.yml`
    explicitly.
  - Trusted publishing can only be configured for packages that already exist on npm, so a package's first
    publish needs a temporary `NPM_TOKEN`.
  - Branch protection on `main`/`release` must let the bot push the back-merge and promotion, or a
    `RELEASE_BOT_TOKEN` must be provided.
