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
|Feature, refactor, a fix a product needs (it reaches the product via its `main`)|`main`|
|Fix that must reach npm without what is on `main`|`release`|

Branch name: `<type>/<short-kebab-slug>` from the chosen base (`git switch -c fix/money-rounding
origin/release`). Opening a draft PR early is optional.

## Checkpoint

Commit in the format above and push (`git push -u origin HEAD`). Before pushing code-impacting work,
the scoped checks from the `verify` skill must be green. Confirm the push landed:
`git rev-parse HEAD` equals `git rev-parse @{u}`.

To commit only given files: `git add -- <files>` with nothing else staged (check
`git diff --cached --name-only`), then commit; repeat per group. To push what is already committed,
skip the commit and run `git push` (`git push -u origin HEAD` for a new branch).

## Publish

`gh pr create --base <base> --title "<conventional title>" --body-file <file>` (or `gh pr ready` for a
draft). The body says what changed and why, in English; the dev pipeline supplies its text. CI
(`ci.yml`) must be green. There is no issue tracker integration in this repo.

## Stack

GitHub's native stacked pull requests, enabled on this repository and driven through `gh api` —
nothing to install. A node is an ordinary `<type>/<slug>` branch whose PR's base is the node below,
with its own Conventional Commit title: each node lands as its own squash commit, titled by its PR.
The bottom node's base is whatever Start picked, so a hotfix line can carry a stack too.

- **Add a node:** with the current node committed and pushed, `git switch -c <type>/<slug>`, commit,
  `git push -u origin HEAD`, `gh pr create --draft --base <node below> --title … --body-file …`.
  Then join it to the stack — the first extra node creates it, later ones append:
  `echo '{"pull_requests":[<bottom>,<new>]}' | gh api -X POST repos/kedrzu/nzyme/stacks --input -`
  or `echo '{"pull_requests":[<new>]}' | gh api -X POST repos/kedrzu/nzyme/stacks/<stack>/add --input -`.
- **Read the chain:** `gh api "repos/kedrzu/nzyme/stacks?pull_request=<any node>" --jq '.[0] |
  .number, (.pull_requests[] | "\(.number) \(.head.ref) \(.state)")'` prints the stack number, then
  the nodes bottom to top. The tip is the last open one; `git switch <head.ref>` checks out any node.
- **Propagate an edit to a lower node:** commit and push it, then for each node above it, bottom-up:
  `git switch <node> && git merge <node below> && git push`. The stack's base (`origin/<base>`, the
  bottom node's PR base — `main` or `release`) is merged into the bottom node only. Merge, never
  rebase or force-push: review comments keep their anchors, conflicts keep their plain ours/theirs
  meaning, and the merge commits vanish in the squash.
- **GitHub rewrites the upper branches itself** after a partial merge or its "Rebase stack" button.
  Keep every node pushed, so after `git fetch` a rewritten node is simply taken from the remote:
  `git switch -C <node> origin/<node>`.
- **Bottom node only:** nothing — nzyme has no submodules.
- **Land** (only on the user's request): `gh pr merge` cannot merge a stacked PR. Submit
  `echo '{"merge_method":"squash"}' | gh api -X PUT repos/kedrzu/nzyme/pulls/<top>/merge-async --input -`
  — it lands that PR and every one below it atomically, one squash commit each. The method must be
  explicit: the API defaults to a merge commit, which this repository does not allow. Poll
  `gh api repos/kedrzu/nzyme/pulls/<top>/merge-async/<uuid> --jq .status` until it is no longer
  `pending`. Every node must be out of draft and green.

## Land

Only on the user's request — merging is outward-facing:

- Normal PRs: `gh pr merge <n> --squash` (the title becomes the commit). A stacked PR lands through
  `merge-async` (Stack).
- The back-merge PR (`release → main`): **merge commit**, never squash — release's commits must
  become ancestors of `main`, or the next back-merge conflicts.

What happens after landing, for orientation:

- `main` → nothing is published. A maintainer runs **Promote main to release** (`promote.yml`) when it
  should ship.
- `release` → `release.yml` opens or updates the release PR `chore(release): vX`; merging it publishes
  to npm, tags and creates the GitHub Release. `back-merge.yml` merges `release` back into `main`.
