# Scoped tests

The default test scripts run only the tests the current change can break; a `:full` variant runs
everything. Selection is `nzyme git affected` (`@nzyme/cli`): one scan builds the repo's import graph,
then every test file whose imports reach a file changed since the base is selected. On a ~6k-file
repo the scan takes about a second, and a change to a leaf module selects one test file where a
package-level selection selected hundreds. How the graph is built and why it is one scan rather than
a grep per file: `nzyme/docs/decisions/file-level-affected-selection-by-full-import-scan.md`. Flags:
`bun nzyme git affected --help`.

## Scripts

|Default — the affected files|Everything|Element|
|-|-|-|
|`tests`|`tests:full`|Setup scripts (`assets/package.json.tmpl`)|
|`test:stories`|`test:stories:full`|UI package (`references/ui-package.md`)|

- `tests` passes `TZ=UTC` and the test patterns to `nzyme git affected`, which appends the selected files
  to `bun test`. The patterns name `*.test.ts` only, so a browser `*.spec.ts` never reaches bun.
- `test:stories` runs with `--per-package`: each package's own `test:stories` script gets the
  selected files, relative to the package, as Vitest filters.
- An empty selection prints `no affected files` and exits 0.
- e2e has no affected variant: what a browser journey touches goes through HTTP and the DOM, which
  no import graph sees. `e2e` always runs everything.

The repo's `verify` skill runs the defaults in its scoped checks and the `:full` variants in its
full protocol (`references/claude-code.md`). CI runs `tests:full` (`references/github.md`): the merge
gate checks everything.

## Config

`nzyme.affected` in the root `package.json` (`assets/package.json.tmpl`):

- **`baseBranches`** — `main`, plus the production branch when the repo has one (`release`,
  `references/github.md`). The base is the candidate with the nearest merge-base, so a hotfix branch
  off `release` diffs against `release`. On GitHub Actions the event's base replaces it, and
  `--base <ref>` (`-b`) replaces both. `nzyme git base` prints the resolved base, for a script
  that scopes other checks (format, typecheck) to the same change and hands it back as `--base`.
- **`aliases`** — `{ "prefix": "@/", "packages": [...] }` listing every Nuxt app: their `@/` alias
  comes from the generated `.nuxt/tsconfig.json`, which the graph does not read.
- **`rewrites`** — `{ "from": ".handler.ts", "to": ".ts" }` and `{ "from": ".loc.yaml", "to":
  ".loc.ts" }`, both from nzyme conventions. A changed `*Endpoint.handler.ts` also counts as its
  endpoint definition, which the frontend imports, so the components calling the endpoint are
  retested. A `.loc.yaml` counts as the gitignored `.loc.ts` generated from it.
- **`fullRunTriggers`** — root-relative globs whose change selects everything: `package.json`,
  `bun.lock`, `bunfig.toml`, `tsconfig*.json`, `nzyme/packages/tsconfig/**`, `**/vitest.config.*`,
  `**/.storybook/**`, plus the test preload when `bunfig.toml` has one. A package's own
  `tsconfig.json` is not a trigger: `nzyme monorepo` generates it from the package's dependencies, so
  it changes on every new dependency. A package's `package.json` needs no entry either, because the
  graph treats it as a change to every file of that package.
- **`ignore`** — root-relative globs whose change selects nothing: `**/*.md`, `docs/**`,
  `.claude/**`.

Without a config, `baseBranches` is `["main"]` and the rest is empty.

A bump of the nzyme submodule needs nothing extra. Submodule files are diffed against the gitlink
the base records, so a bump selects the product tests whose imports reach the changed nzyme files.

## When the graph does not see it

Imports are the graph's evidence. ESM imports (type-only included), Vue `src` attributes, Sass
`@use`/`@import` and `new URL('…', import.meta.url)` are edges. Gitignored generated sources become
nodes once something imports them. A non-source file that nothing imports (a fixture read through
`fs`) selects every test of its package. What none of that reaches: a path computed at runtime, a
process started by name, behaviour behind HTTP. A test that depends on a file that way runs only in
the `:full` variants, so the full protocol is what proves it.

## Compare

- No `nzyme.affected` block, or `tests` without `nzyme git affected`: a difference, unless
  `ARCHITECTURE.md` records why the repo runs everything.
- A `tests:full` or `test:stories:full` missing next to its default: a difference.
- `fullRunTriggers` or `ignore` with entries of the repo's own (another config file, a generated
  directory): stay. A Nuxt app missing from `aliases`: a difference.
- CI running `tests` instead of `tests:full`: a difference (`references/github.md`).
