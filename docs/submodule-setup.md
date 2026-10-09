# Setting up nzyme as a submodule

How a product monorepo includes nzyme as a git submodule and builds it from source: workspace,
dependencies, TypeScript, build, Nx, lint and format, tests, setup and agents. Which nzyme commit a
product pins, and how that pin moves forward, is a separate topic: [consumers.md](consumers.md).

Everything below was checked in a product-shaped workspace (product packages plus `nzyme/packages/*`,
dependencies hoisted to the product, no `nzyme/node_modules`). The healed monorepo is a working
example of most of it.

**Ownership in one line:** the product owns its workspace, lockfile, build and CI. nzyme owns its
code, rules and tests, which still apply inside the product.

## Add the submodule

```sh
git submodule add https://github.com/kedrzu/nzyme.git nzyme
```

```ini
[submodule "nzyme"]
    path = nzyme
    url = https://github.com/kedrzu/nzyme.git
```

- **No `branch` and no `update` entry.** The pin is the gitlink, nothing else: a `branch` invites
  `git submodule update --remote`, which builds whatever nzyme `main` is today, and `update = merge`
  can leave a local checkout off the pin. How the pin moves: [consumers.md](consumers.md).

- **Every clone and worktree** runs `git submodule update --init`. Put it in the product's setup script.

- **CI checks out** with `actions/checkout` and `submodules: recursive`. nzyme is public, so the default
  token is enough.

- **One remote URL in every product:** `https://github.com/kedrzu/nzyme.git`.

## Workspace and dependencies

nzyme's packages become workspaces of the product, so they link to each other and to product
packages without npm. nzyme's own `bun.lock` and root `package.json` are ignored here: the product's
lockfile pins every dependency, nzyme's included.

```json
{
    "workspaces": ["packages/*", "nzyme/packages/*"],
    "packageManager": "bun@1.4.2",
    "devDependencies": {
        "@nzyme/cli": "workspace:*",
        "@nzyme/eslint": "workspace:*",
        "@nzyme/tsconfig": "workspace:*"
    },
    "overrides": { "@types/bun": "1.4.2" },
    "patchedDependencies": { "bun-types@1.4.2": "patches/bun-types@1.4.2.patch" }
}
```

- **Include the whole `nzyme/packages/*`.** nzyme packages depend on each other through `workspace:*`,
  which resolves only against workspace members.
- **Depend on nzyme as `workspace:*`, never a version.** A pinned `"0.14.0"` stops matching the
  workspace copy after the next release, and bun silently installs the old version from npm instead.
- **Keep the toolchain on nzyme's versions.** Run inside the product, nzyme's scripts use the product's
  hoisted binaries and types, so a different version lints, formats or type-checks nzyme differently
  from nzyme's own CI. Align these with nzyme's root `package.json`:
  - Bun (`packageManager`);
  - `@types/bun` (with the override above);
  - `@typescript/native-preview`;
  - `oxlint`, `oxlint-tsgolint`, `oxfmt`, `eslint`.
- **Apply the `bun-types` patch.** Copy `nzyme/patches/bun-types@<version>.patch` into the product and
  declare it as above. Without it, nzyme's tests type `await expect(…).rejects` as non-awaitable and
  fail type-aware lint.

## TypeScript and generated files

The product's root needs a `tsconfig.esm.json` for the generator to extend:

```json
{
    "extends": "@nzyme/tsconfig/esm.json",
    "include": [],
    "references": [],
    "compilerOptions": { "noEmit": true }
}
```

Two `nzyme` CLI commands generate the rest:

- **`nzyme monorepo`**, run from the product root. It writes a `tsconfig.json` into every workspace
  package, nzyme's included, with project references to its workspace dependencies, plus a root
  `tsconfig.json` referencing them all. Re-run it after adding a package or changing internal
  dependencies.
- **`nzyme localise`** compiles every `.loc.yaml` into `.loc.ts`.

All generated files are gitignored, in both trees. In the product's `.gitignore`:

```gitignore
tsconfig.json
tsconfig.cjs.json
*.loc.ts
/INDEX.md
/UTILS.md
/packages/*/INDEX.md
```

nzyme's own `.gitignore` covers its tree. Never commit or edit generated files.

## Build

The product builds nzyme packages together with its own. Workspace imports of `@nzyme/*` resolve to
their `dist`, so nothing runs before this has been done:

```sh
if [ "$CI" = "true" ]; then
    bun install --frozen-lockfile
else
    bun install
fi
bun nx run @nzyme/cli:build       # the generators below are part of the CLI
bun run monorepo && bun run localise
bun x tsgo --build                # or: bun nx run-many -t build
```

- **Scripts:** keep this order in one script (`setup.build.sh` in nzyme and in healed) and use it both
  locally and in CI.
- **Vue packages ship TypeScript and `.vue` sources:** `vue`, `vue-forms`, `vue-i18n`,
  `vue-transitions`. The product's bundler (Vite or Nuxt) compiles them; `tsgo` only emits their
  declarations.
- **`@nzyme/logging-ui` is a private Nuxt app** and becomes a workspace member like the rest. Leave it
  out of builds (`--exclude=@nzyme/logging-ui` for Nx) unless the product uses it.

## Nx

Nx hashes only files the product's git index tracks, and for a submodule that index holds a single
gitlink. Without extra inputs, a change inside `nzyme/` — even an uncommitted one — does not
invalidate cached builds. Hash the submodule's tree explicitly and add it to `default` and
`production`, as healed does:

```jsonc
"namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals", "submoduleDefault"],
    "submoduleDefault": [
        { "runtime": "{ git -C nzyme ls-tree -r HEAD; git -C nzyme diff --binary HEAD; git -C nzyme ls-files --others --exclude-standard | git -C nzyme hash-object --stdin-paths; } | git hash-object --stdin" }
    ],
    // The same, excluding test files and snapshots, so editing them does not invalidate production builds.
    "submoduleProduction": [
        { "runtime": "{ git -C nzyme ls-tree -r HEAD | grep -Ev '\\.(test|spec)\\.[jt]sx?$|/__snapshots__/|\\.snap$'; git -C nzyme diff --binary HEAD -- . ':(exclude,glob)**/*.test.*' ':(exclude,glob)**/*.spec.*' ':(exclude,glob)**/__snapshots__/**' ':(exclude,glob)**/*.snap'; git -C nzyme ls-files --others --exclude-standard -- . ':(exclude,glob)**/*.test.*' ':(exclude,glob)**/*.spec.*' ':(exclude,glob)**/__snapshots__/**' ':(exclude,glob)**/*.snap' | git -C nzyme hash-object --stdin-paths; } | git hash-object --stdin" }
    ],
    "production": [
        "{projectRoot}/**/*",
        "sharedGlobals",
        "submoduleProduction",
        "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)",
        "!{projectRoot}/**/__snapshots__/**",
        "!{projectRoot}/**/*.snap"
    ]
}
```

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
- `eslint.config.mjs`: `globalIgnores([..., "nzyme/**"])`. ESLint does discover nested configs, but this
  stops a directory run from descending into `nzyme/`, so `nzyme/eslint.config.mjs` is never used. ESLint
  is here only for the Vue rules oxlint does not cover.
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

## Tests

The product's test command covers its own packages. nzyme's tests are nzyme's: its CI runs them on
every change, and a bump PR in the product proves the product still works with the new pin. To run
them in place, for example while changing nzyme from inside the product:

```sh
bun run --cwd nzyme test                  # everything
bun test nzyme/packages/<pkg>/src         # one package, from the product root
```

## Setup script and worktrees

A product's setup script (Paseo runs it for every new worktree through `paseo.json`) does, in order:

1. `git submodule update --init` (before anything is installed — the workspace globs point into it).
2. The build above.
3. Optionally `nzyme index`, to generate the code map for agents. It covers nzyme's packages too;
   configure it under `nzyme.index` in the product's `package.json`.

## Agents

- **nzyme's rules:** `nzyme/AGENTS.md` and the `nzyme` plugin describe how to use and change nzyme.
  Point the product's `AGENTS.md` at them for work inside `nzyme/`. Changes there follow nzyme's
  conventions: Conventional Commits, and a PR to `kedrzu/nzyme`.
- **The plugin:** install it from nzyme's marketplace via the product's `.claude/settings.json`:

  ```json
  {
      "extraKnownMarketplaces": {
          "nzyme": { "source": { "source": "github", "repo": "kedrzu/nzyme" }, "autoUpdate": true }
      },
      "enabledPlugins": { "nzyme@nzyme": true }
  }
  ```

  Alternatively, symlink `.claude/skills/nzyme` → `../../nzyme/plugins/nzyme`. The skills then load from
  the submodule and always match the nzyme commit the product pins, but drop the marketplace entry,
  because a marketplace install of the same plugin wins over the symlinked copy.
