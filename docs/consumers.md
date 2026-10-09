# Pinning nzyme in a product

A product that builds nzyme from source as a git submodule owns its pin: the gitlink in the product's
own history is the only record of which nzyme commit each product branch runs, and only the product
moves it. nzyme holds no product state and products hold no credentials to nzyme. Why:
[the ADR](decisions/product-owned-submodule-pins.md). Setting the submodule up in the first place
(workspace, build, lint, format): [submodule-setup.md](submodule-setup.md).

## Rules

1. **Production runs exactly the pin.** Every checkout that builds or deploys uses the gitlink of the
   commit being built: `actions/checkout` with `submodules: recursive`, or
   `git submodule update --init`. Never `--remote`, never `git submodule foreach … pull`, never a
   `branch =` in `.gitmodules` that a script follows. Assert it before building (see below).
2. **Only `main` is bumped automatically.** A bump is a PR the product's CI must pass; on `main` it
   may merge itself. Branches that deploy to production (`release`, hotfix branches) receive a new
   pin only through the product's normal promotion — a merge from `main` brings `main`'s pin along —
   or through an explicit, reviewed hotfix PR. No automation writes to them.
3. **Pin only commits that stay reachable**: commits on nzyme `main` or `release`, or a hotfix branch
   that is merged into `main` with a merge commit (below). A commit reachable only from a deleted
   branch is garbage-collected, and the pin then points at nothing.

## Guard rails in the product

- **Deploy-time assertion.** Right before building, fail when the checked-out submodule differs from
  the pin — `git submodule status` prefixes such a submodule with `+` (or `-` when it is missing):

  ```sh
  if git submodule status --recursive | grep -q '^[-+U]'; then
      git submodule status --recursive
      echo "Submodule checkout differs from the pinned commit" >&2
      exit 1
  fi
  ```

- **Make pin changes visible on production PRs.** A required check on PRs into the production branch
  that, when the PR moves the nzyme gitlink to something other than what `main` pins, fails or asks
  for an explicit label (e.g. `nzyme-hotfix`). The usual promotion `main → release` passes untouched;
  an unexpected pin change stops for a human.

- **Required status checks** on the bumped branch, so an auto-merging bump PR cannot merge before CI.

## Bumping `main`

`consumer-bump.yml` (a reusable workflow here) moves the submodule on a product branch to an nzyme
ref, pushes `nzyme-bump/<base-branch>` and opens or refreshes a PR listing the incoming nzyme
commits. It writes only to the product, with the product's token. When the branch already pins the
source it closes a stale bump PR and stops. A daily (and manual) bump of `main`, merging itself when
green:

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

`NZYME_BUMP_TOKEN` needs contents and pull-requests write on the **product** repository. Not
`GITHUB_TOKEN`: a PR it opens triggers no workflows, so the product's CI would never run on the bump.
The workflow runs `@nzyme/cli` from npm (input `cli-version`, default `latest`); `submodule bump`
exists from the first release that contains it. The same command runs locally:
`bunx @nzyme/cli submodule bump --source origin/main` stages the move and prints the summary.

Working on nzyme from inside the product does not change this: the nzyme change is a PR to nzyme,
and the product's PR pins the merged commit (or the bump picks it up).

## Lint and format

nzyme owns its own lint and format configuration (`.oxlintrc.json`, `.oxfmtrc.json`,
`eslint.config.mjs`), and it applies to the nzyme tree also inside a product. The product lints and
formats only its own code and runs nzyme's scripts for the submodule. Each repository can then evolve
its rules on its own, and neither formats the other's files. Why: [the ADR](decisions/lint-and-format-owned-per-repository.md).

An `ignorePatterns` entry alone does **not** exclude the submodule. oxlint and oxfmt discover nested
config files, and `nzyme/.oxlintrc.json` / `nzyme/.oxfmtrc.json` replace the product's config for
that subtree, its ignore list included. The product's CLI runs must also skip nested configs. Editors
should keep discovering them, so files opened under `nzyme/` get nzyme's rules.

In the product:

- `.oxlintrc.json`: `"ignorePatterns": [..., "nzyme/**"]`
- `.oxfmtrc.json`: `"ignorePatterns": [..., "nzyme"]`
- `eslint.config.mjs`: `globalIgnores([..., "nzyme/**"])`. ESLint has no nested-config discovery, so
  this is enough.
- `package.json` scripts:

  ```json
  {
      "lint": "oxlint --type-aware --quiet --disable-nested-config --fix . && eslint --fix .",
      "lint:check": "oxlint --type-aware --quiet --disable-nested-config . && eslint .",
      "format": "oxfmt --disable-nested-config . && nzyme format-markdown . --exclude nzyme",
      "format:check": "oxfmt --check --disable-nested-config . && nzyme format-markdown --check . --exclude nzyme",
      "lint:nzyme": "bun run --cwd nzyme lint:check && bun run --cwd nzyme format:check"
  }
  ```

  If the product relies on nested configs of its own, use `--ignore-pattern "nzyme/**"` for oxlint, and
  `--ignore-path .gitignore --ignore-path <file listing nzyme>` for oxfmt, instead of
  `--disable-nested-config`.

nzyme's scripts work in place, with dependencies hoisted to the product's workspace and no
`nzyme/node_modules`. They need the product's build done first: the oxlint preset loads the
`@nzyme/oxlint` plugin from its `dist`.

## Hotfix for a product's production

The product's production branch pins nzyme commit `P`, and `main` has moved on in both repositories.

1. In nzyme, branch from `P` (`git switch -c fix/<slug> P`), fix, push, and open a PR into nzyme
   `main`.
2. In the product, on its hotfix branch, pin the fix commit and ship it through the product's normal
   hotfix review — this is the explicit pin change the guard rail asks a human to approve.
3. Merge the nzyme PR with a **merge commit**, not a squash: the pinned commit then stays reachable
   from `main` after the branch is deleted, and the product's next ordinary bump of `main` contains
   it.
