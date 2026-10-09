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
   pin only through the product's promotion — a merge from `main` brings a pin `main` has run. No
   automation writes to them.
3. **Production runs only pins `main` has run.** A pin reaches a production branch only after it was
   the pin of the product's `main` at some point, so the product's CI and its non-production
   environments have run it. Pins on nzyme `main` also stay reachable; a commit reachable only from a
   deleted branch is garbage-collected, and the pin then points at nothing.

## Guard rails in the product

- **Deploy-time assertion.** Right before a production build, fail when the checked-out submodule
  differs from the pin — `git submodule status` prefixes such a submodule with `+` (or `-` when it
  is missing). Deploys to non-production environments may warn instead, so a working tree can still
  be deployed while debugging:

  ```sh
  if git submodule status --recursive | grep -q '^[-+U]'; then
      git submodule status --recursive
      echo "Submodule checkout differs from the pinned commit" >&2
      exit 1
  fi
  ```

- **A required check on PRs into the production branch** that fails when the PR's nzyme pin was never
  the pin of the product's `main` (rule 3) — e.g. collected from `git log -p origin/main -- nzyme`.
  A promotion from `main`, or a rollback to an older `main` pin, passes even after `main` has moved
  on. The check also lists the nzyme commits between the old and the new pin, which a PR diff shows
  only as `Subproject commit a → b`.

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
      cli-version: <version>
      auto-merge: true
    secrets:
      token: ${{ secrets.NZYME_BUMP_TOKEN }}
```

`NZYME_BUMP_TOKEN` needs contents and pull-requests write on the **product** repository. Not
`GITHUB_TOKEN`: a PR it opens triggers no workflows, so the product's CI would never run on the bump.
The workflow runs `@nzyme/cli` from npm at `cli-version`, a required exact version (no dist-tag or
range): the job holds the product's write token, so a moving tag would run whatever is published
next with it. `submodule bump` exists from the first release that contains it. The same command
runs locally:
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

An nzyme fix reaches production the way every pin does — through the product's `main`:

1. Fix it in nzyme with an ordinary PR into nzyme `main`.
2. Bump the product's `main` to it (the bump PR, or the scheduled bump).
3. Promote that pin to the production branch with the product's release, or with a product hotfix
   PR that sets the pin to the one `main` now runs. It brings every nzyme change between the old and
   the new pin — the required check lists them.
