# GitHub

GitHub gates every pull request with the same build and checks the repo runs locally, and keeps the
nzyme pin moving through PRs that gate too. How a change becomes a branch, a commit and a PR is not
this element's: it belongs to the repo's `git-workflow` skill, written by `/git:setup`.

## Reference state

- **PR flow** — `.claude/skills/git-workflow/SKILL.md`. If it is missing, `SKILL.md`'s Finish step
  sends the user to `/git:setup`. The PR title becomes the squash commit, so `paseo.json`'s
  instructions and the skill agree on the commit style (`references/setup-scripts.md`).
- **`.github/workflows/build.yml`** — `assets/workflows/build.yml.tmpl`, the merge gate on every PR:
  checkout with `submodules: recursive` (the gitlink, never `--remote`), bun from `packageManager`,
  `bash setup.build.sh`, then `typecheck`, `lint:check`, `format:check` and `tests` — what the
  `verify` skill's full protocol runs. No secrets; the job name `Build` is the required check.
- **Repository settings** — a ruleset on `main` requiring `Build` (and `Verify Submodules` when that
  workflow is in), squash merges only, auto-merge allowed.

Optional, for a repo that wants its nzyme pin moved and guarded by automation (the rules they
enforce: `docs/consumers.md` in nzyme, `../../../../docs/consumers.md` from this skill):

- **`bump-nzyme.yml`** — `assets/workflows/bump-nzyme.yml.tmpl`. Calls nzyme's reusable
  `consumer-bump.yml` every weekday: moves the submodule to nzyme `main`, refreshes `bun.lock`, opens
  a PR that merges itself once green. Needs a GitHub App with contents and pull-requests write and no
  ruleset bypass, its client ID as the repository variable `BUMP_APP_CLIENT_ID`, its key as the
  secret `BUMP_APP_PRIVATE_KEY` of a `submodule-bump` environment admitting only `main`.
- **`verify-submodules.yml`** — `assets/workflows/verify-submodules.yml.tmpl`. Required check
  `Verify Submodules` on PRs into `main`: every pin is on its submodule's `main` and none moves back
  from the base's.
- **`release-pin-guard.yml`** — `assets/workflows/release-pin-guard.yml.tmpl`, only for a repo with
  a production branch besides `main`. Required check on that branch: a PR may only keep a pin or set
  one `main` has had, and its summary lists the nzyme commits it brings.

Both checks filter the trunk with a job-level `if:` on `stack.base.ref || base.ref`, not with
`branches:`: an upper node of a stacked PR has the node below as its base, and a trigger filter
would never report its required check.

## Placeholders

`${{ … }}` is GitHub's expression syntax, not a placeholder.

- `{{ref:<action>}}` — the ref the same action has in nzyme's own workflows
  (`../../../../.github/workflows/`), so the product moves with nzyme.
- `{{nzymeSha}}` — the full SHA of the nzyme commit the repo pins (`git rev-parse HEAD:nzyme`); it is
  on nzyme `main` and has `consumer-bump.yml`. A SHA, not `@main` or a tag: the workflow runs with the
  App's key, and a moved ref would change that code without a change in the repo.
- `{{cliVersion}}` — the exact `@nzyme/cli` release: `version` in `nzyme/packages/cli/package.json`,
  confirmed with `npm view @nzyme/cli@<version> version`. Never a range or dist-tag.
- `{{productionBranch}}` — the production branch, e.g. `release`.

## Compare

- CI that runs `setup.sh`, or its own copy of the install and build commands, instead of
  `bash setup.build.sh`: a difference — the build CI proves is then not the local one.
- A checkout without `submodules: recursive`, any `submodule update --remote` or `foreach … pull`, a
  hardcoded `bun-version`: differences.
- A missing check step: a difference, unless `ARCHITECTURE.md` records why (tests that need local
  infrastructure the runner lacks are the usual reason; record what replaces them).
- Workflows the reference has no opinion on (deploys, scheduled jobs, e2e against a deployed
  environment, Dependabot) stay.
- No `.github/` at all: propose `build.yml`; offer the optional workflows and record the answer.
- A bump workflow calling `consumer-bump.yml@main` or a tag: a difference (pin by SHA).
