# Pinning and promoting nzyme in a product

Products that build nzyme from source as a git submodule move it forward through their own CI, and
nzyme records per product which of its commits passed it. Why: [the ADR](decisions/per-consumer-submodule-refs.md).
Setting the submodule up in the first place (workspace, build, lint, format): [submodule-setup.md](submodule-setup.md).

## The model

- nzyme has two refs per product ("consumer"): `<consumer>/main` and `<consumer>/release`, e.g.
  `healed/main`. Each is the nzyme commit the product's branch of that name pins — one its CI passed.
- A product moves nzyme forward with a **bump PR** (`consumer-bump.yml`). Its CI is the gate.
- After the product's CI passes on a push to its `main` or `release`, the product **mirrors** its pin
  to the ref (`consumer-mirror.yml`). Refs only fast-forward. A pin that does not descend from the
  ref fails the job and leaves the ref untouched — nothing is ever force-pushed.
- Policy — cadence, source ref, auto-merge — belongs to the product. nzyme only ships the building
  blocks: `nzyme submodule mirror`, `nzyme submodule bump` (`@nzyme/cli`) and the workflows below.

The workflows run `@nzyme/cli` from npm (input `cli-version`, default `latest`); the `submodule`
commands exist from the first release that contains them.

## Adopting it

1. **Pick a consumer name** (e.g. `healed`) and point the submodule at its line in `.gitmodules`:

   ```ini
   [submodule "nzyme"]
       path = nzyme
       url = https://github.com/kedrzu/nzyme.git
       branch = healed/main
   ```

2. **Secrets in the product repository:**
   - `NZYME_TOKEN` — may push branches to `kedrzu/nzyme` (contents: write). A fine-grained PAT
     scoped to that repository. An installation token minted at runtime by a GitHub App cannot be
     handed to a reusable workflow as a secret, so it would have to be a stored, long-lived token.
   - `NZYME_BUMP_TOKEN` — contents and pull-requests write on the product repository. Not
     `GITHUB_TOKEN`: pushes and PRs made with it trigger no workflows, so the product's CI would never
     run on the bump.

3. **Settings.** In the product: "Allow auto-merge" and required status checks on the bumped
   branches — without required checks, auto-merge merges a bump before CI ran. In nzyme: a ruleset on
   `*/main` and `*/release` that blocks force pushes and deletion (the server-side half of
   "fast-forward only"), and merge commits allowed (forward-ports need them).

4. **Retire the old automation** that moves the submodule to nzyme `main`'s tip on push and requires
   PRs to pin that tip — it is what this replaces.

## Example workflows (in the product)

Mirror after CI, on pushes to `main` and `release` — a job in the product's CI workflow:

```yaml
on:
  push:
    branches: [main, release]
  pull_request:

jobs:
  test:
    # … the product's build and tests …

  nzyme-mirror:
    needs: [test]
    if: github.event_name == 'push'
    uses: kedrzu/nzyme/.github/workflows/consumer-mirror.yml@main
    with:
      consumer: healed
    secrets:
      nzyme-token: ${{ secrets.NZYME_TOKEN }}
```

From a separate `workflow_run`-triggered workflow instead, pass
`branch: ${{ github.event.workflow_run.head_branch }}` and `ref: ${{ github.event.workflow_run.head_sha }}`.

A daily (and manual) bump of `main` from nzyme `main`, merging itself when green:

```yaml
name: Bump nzyme

on:
  schedule:
    - cron: '0 6 * * 1-5'
  workflow_dispatch:

jobs:
  bump:
    uses: kedrzu/nzyme/.github/workflows/consumer-bump.yml@main
    with:
      source-ref: main
      base-branch: main
      auto-merge: true
    secrets:
      token: ${{ secrets.NZYME_BUMP_TOKEN }}
```

A manual bump of `release` to what `main` already runs:

```yaml
name: Bump nzyme on release

on:
  workflow_dispatch:
    inputs:
      source-ref:
        description: nzyme ref to bump to
        default: healed/main

jobs:
  bump:
    uses: kedrzu/nzyme/.github/workflows/consumer-bump.yml@main
    with:
      source-ref: ${{ inputs.source-ref }}
      base-branch: release
    secrets:
      token: ${{ secrets.NZYME_BUMP_TOKEN }}
```

`consumer-bump.yml` pushes `nzyme-bump/<base-branch>` (input `pr-branch`), titles the PR with
`commit-message` (default `chore: bump nzyme to {sha}`) and lists the incoming nzyme commits in its
body. When the base branch already pins `source-ref`, it closes a stale bump PR and stops.

## Hotfix for a product's production

1. In nzyme, branch from what production runs and PR the fix into it:
   `git switch -c fix/<slug> origin/healed/release`, then a PR with base `healed/release`. nzyme's CI
   runs on it as on any PR.
2. Merging it triggers `forward-port.yml`, which opens `chore: forward-port healed/release into main`.
3. In the product, run the release bump with `source-ref: healed/release`. Its CI gates it; once merged
   and green on `release`, the release mirror is a no-op (`healed/release` is already there).
4. Merge the forward-port PR **with a merge commit** — not a squash or rebase, which would land a copy
   and leave `healed/release` diverged from `main`. Do not delete `healed/release`. Merge it before the
   next release bump from `healed/main`, or that bump drops the hotfix and its mirror is refused.

## Rollback

If the product goes back to an older nzyme (e.g. it reverts a bump), the next mirror finds that the
pin does not descend from the ref and **fails**, leaving the ref where it was. The job summary and log
name both commits. It keeps failing on every push until resolved:

- **Preferred: fix forward.** Revert or fix the offending change in nzyme `main` and bump the product
  to that. The new pin descends from the ref, so the mirror fast-forwards again.
- **Only if the ref itself must go back:** a maintainer moves it deliberately, guarding against a
  concurrent move — `git push --force-with-lease=refs/heads/healed/main:<current> origin <pin>:refs/heads/healed/main`
  (bypassing the ruleset).
