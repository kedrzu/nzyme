# Lint and format

oxlint does all the linting (type-aware), ESLint runs only the Vue rules oxlint lacks, oxfmt formats
code and `nzyme format-markdown` formats markdown. The rules are nzyme's: the repo's configs extend
the shared preset and add only what the repo's layout needs. The repo lints and formats its own tree
and never nzyme's.

## Reference state

- **`.oxlintrc.json`** — `assets/oxlintrc.json.tmpl`. Extends `@nzyme/eslint/oxlintrc.json`, the
  preset that also loads nzyme's custom rules (the `@nzyme/oxlint` JS plugin). That plugin loads from
  its `dist`, so lint runs after the build. Ignores generated files no `.gitignore` covers and
  `nzyme/**`. One override turns off the `no-unsafe-*` family for packages that import `.vue` files:
  tsgo cannot type SFC imports, so those rules report the tooling gap, not real unsafety.
- **`.oxfmtrc.json`** — `assets/oxfmtrc.json.tmpl`. nzyme's formatting options, ignoring build
  output, markdown (formatted by `format:md`), `.context` and `nzyme`.
- **`eslint.config.mjs`** — `assets/eslint.config.mjs.tmpl`: `vue()` from `@nzyme/eslint` behind
  `globalIgnores`. ESLint does not read `.gitignore`, so build output, `.claude/worktrees/**` (agent
  worktrees are full checkouts) and `nzyme/**` are listed.
- **Scripts** in the root `package.json` (`assets/package.json.tmpl`): `lint`, `lint:check`,
  `lint:warnings`, `format`, `format:check`, `format:md`, `format:md:check`, `lint:nzyme`.
  - `--quiet` reports errors only; `lint:warnings` is the opt-in view of the warning backlog, never
    part of verification.
  - The flags that keep nzyme out: below.
  - `--exclude .context` on `format-markdown`: `.context/` is agent scratch space. The formatter
    already skips gitignored paths; the flag keeps the scratch space out even where `.gitignore`
    lacks it, as nzyme's own scripts do. nzyme's docs show the scripts without it.
  - `lint:nzyme` runs nzyme's own `lint:check` and `format:check` in place, for changes made inside
    `nzyme/`.
- **Dev dependencies:** `@nzyme/eslint`, `eslint`, `oxlint`, `oxlint-tsgolint` (type-aware rules),
  `oxfmt`, all in `assets/package.json.tmpl`. `@nzyme/oxlint` arrives through `@nzyme/eslint`.

## Keeping nzyme out

nzyme's tree is linted and formatted by nzyme's configs, in nzyme's CI. Why, and the mechanism
(nested configs replace the product's, ignore list included): `docs/submodule-setup.md#lint-and-format`
in nzyme (`../../../../docs/submodule-setup.md` from this skill). That section lists every part of
the exclusion (three config ignores and the script flags); the assets carry all of them, and a part
missing from the repo is always a difference — each alone leaves a hole.

Editors keep discovering nested configs, so a file opened under `nzyme/` gets nzyme's rules
(`references/vscode.md`).

## Placeholders

- `{{vuePackage}}` in `.oxlintrc.json`: the path of each package that imports `.vue` files (a Nuxt
  app, a UI package), one `files` entry each, e.g. `packages/app`. No such package: drop the
  override.

## Compare

- The three configs: key-wise. The repo's own `ignorePatterns`, `globalIgnores` entries and
  overrides stay (a technology adds its own, e.g. Drizzle's `migrations/meta` in `.oxfmtrc.json`).
  Formatting options that differ from the template are a difference, since they reformat every file
  against nzyme's style.
- Any of the four nzyme exclusions missing: always a difference, shown even when the rest matches.
- `extends` by a path into the submodule (`./nzyme/packages/eslint/oxlintrc.json`) instead of
  `./node_modules/@nzyme/eslint/oxlintrc.json`: a difference; the package path is the one that
  survives a layout change.
- Scripts: by name. Stricter flags the repo chose (`--deny-warnings`, `--max-warnings 0`) are a
  recorded choice, not a difference. A missing `format:md`, `format:md:check` or `lint:nzyme` is.
- Leftovers of the previous toolchain (`.prettierrc`, `.prettierignore`, `.eslintrc*`, a
  `prettier` dependency): propose deleting them.
- A custom check the repo runs beside lint (a TODO format check, an import-cycle check) is the
  repo's; keep it in its own script.
