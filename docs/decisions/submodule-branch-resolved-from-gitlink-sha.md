# Submodule branch resolved from the gitlink SHA

> Recorded in the consuming healed monorepo, where nzyme is a git submodule, and moved here because the decision is about nzyme. Mentions of Healed describe the consumer the decision was made for.

## Status

Accepted

## Context

`nzyme/` was this repo's only git submodule when this was decided (`skills/` joined on 2026-10-05
and follows the same rule, with its own commit convention): a separate, generic framework repository reused across
projects, some of whose packages publish to npm as `@nzyme/*` (`@nzyme/github-cli` and
`@nzyme/linear` are private, but they live in that repo and follow its rules). It has its own commit
convention (Conventional Commits) and knows nothing about Healed or Linear.

The task-switching CLI nevertheless derived the submodule's whole identity from the main repo's
task. `handleSubmoduleReadyPreparation` forced the submodule onto a branch named exactly like the
main repo's task branch, committed `[HLD-NNN] Submodule changes`, and opened a PR whose title
carried the Linear ID. Seven separate lookups then found that PR by matching the Linear issue ID
against the submodule's PR titles and branch names.

> **Checked 2026-09-21:** the consequence is visible on the submodule's remote — `git -C nzyme
> branch -a` lists `origin/feature/sig-125-make-api-gateways-unreachable-except-through-cloudfront-waf`
> and nine siblings. A framework repo carrying another product's issue tracker in its branch names.

Removing the ID from the submodule's names removes the only thing those seven lookups matched on,
so the question became: what links a task in the main repo to its branch in the submodule, once
the names are free to differ?

The main repo does not record a submodule branch. A commit records a **gitlink** — the submodule's
commit SHA — and nothing else. `.gitmodules` has an optional `branch` field, but it is advisory and
exists for `git submodule update --remote`, not for identifying work in progress.

> **Checked 2026-09-21:** healed's `verify-submodule-refs.ts` CI script already answers this
> question and has since it was written. Its `getBranchesContainingCommit` runs
> `git branch -r --contains <gitlink-sha>` inside the submodule and derives the branch from the
> result. It never reads a branch name or a PR title. Run against this worktree's current pin, it
> returns exactly `origin/main`; across the ten stale `feature/sig-*` branches there is no commit
> that two of them share.

## Options Considered

- **Option A — record the branch explicitly.** Write `submodule.nzyme.branch` into `.gitmodules`
  when the branch is created, and read it back. Trade-off: unambiguous, works offline, visible in
  the diff — but it is new state that must be created, kept correct, and reset on merge, and every
  PR touching the submodule gains a `.gitmodules` hunk. It also overloads a field git already uses
  for something else.
- **Option B — a naming convention both repos compute.** Derive the submodule branch name from the
  main branch by a deterministic transform. Trade-off: no new state, but it re-couples the two
  repos — a different shape of the same defect this change exists to remove — and it breaks the
  moment a human names a branch by hand.
- **Option C — resolve from the gitlink SHA.** Ask the submodule which of its remote branches
  contain the pinned commit, discard the base branches, and take what is left. Trade-off: no new
  state and no coupling, but the answer can be ambiguous when several task branches contain the
  same commit, and it needs the submodule fetched.

## Decision

Option C. The gitlink is the only fact the main repo actually records about the submodule, so
making it the only link means there is nothing to keep in sync and nothing to get stale. The
mechanism is not speculative: CI has been resolving the submodule branch this way in production,
and it is precisely the check that catches an unmerged submodule PR before a main PR lands.

Ambiguity is a hard failure, not a guess. When more than one non-base branch contains the pinned
commit, the tool raises a `UsageError` naming the candidates and stops. Resolving it by heuristic —
most recently updated, best name match — is how a tool silently pushes to the wrong branch.

The base-branch list is a parameter supplied by the consuming project, never a constant inside
`@nzyme/github-cli`. Baking `main`/`release` into the generic package would reintroduce, one layer
down, the same policy leak this decision removes.

Naming policy for the submodule — Conventional Commits, `<type>/<slug>` branches, no issue IDs —
lives in the agent skills, not in code. The CLI does not generate submodule names at all any more;
non-interactively it verifies the submodule is ready and refuses otherwise, and interactively it
asks a human.

## Consequences

Existing submodule branches and PRs keep working with no migration: resolution reads the SHA, which
the old naming scheme also produced. The submodule stops accumulating another product's issue IDs,
and `@nzyme/github-cli` stops containing anything Healed- or Linear-specific.

We accept that a submodule commit sitting on two task branches at once cannot be resolved
automatically and stops the command. That state is rare and is itself a symptom worth looking at.

We also accept that the submodule must be fetched before resolution answers correctly — the same
precondition CI already carries.
