# Monorepo layout

A Bun workspace with the product's packages under `packages/*` and nzyme's under `nzyme/packages/*`,
built from source. nzyme's `docs/submodule-setup.md` (`../../../../docs/submodule-setup.md` from this
skill, `nzyme/docs/submodule-setup.md` in a product) owns the workspace and toolchain rules; this
reference adds the files around them.

## Reference state

|File|Asset|What the reference owns|
|-|-|-|
|`package.json`|`assets/package.json.tmpl`|every key except `scripts` (`references/setup-scripts.md` owns those)|
|`tsconfig.esm.json`|`assets/tsconfig.esm.json.tmpl`|the whole file|
|`bunfig.toml`|`assets/bunfig.toml.tmpl`|the three `jsx` lines|
|`.gitignore`|`assets/gitignore.tmpl`|every line|
|`.gitattributes`|`assets/gitattributes.tmpl`|every line|
|`.editorconfig`|`assets/editorconfig.tmpl`|the whole file|
|`patches/bun-types@<version>.patch`|copied from `nzyme/patches/`|the file and its `patchedDependencies` entry|

- **Names:** the root package is the product name (`{{name}}`, no scope); every package is
  `{{scope}}/<package>` in `packages/<package>`; the root Nx project is `{{name}}-root`
  (`assets/project.json.tmpl`, `references/nx.md`).
- **Workspaces, `workspace:*` dependencies, the toolchain versions and the `bun-types` patch:**
  `docs/submodule-setup.md#workspace-and-dependencies`.
- **`tsconfig.esm.json` is the only committed root tsconfig.** `nzyme monorepo` generates every
  `tsconfig.json` and `tsconfig.cjs.json`, which stay gitignored:
  `docs/submodule-setup.md#typescript-and-generated-files`. A package whose tsconfig is hand-written
  (a Nuxt app extending `.nuxt/tsconfig.json`) gets a `!/packages/<package>/tsconfig.json` line; so
  does `scripts/` for the Nx guard test (`references/nx.md`).
- **`nx.includedScripts: []`** in the root `package.json` — why: `docs/submodule-setup.md#nx`. Root
  targets live in `project.json` only.
- **`bunfig.toml`:** bun reads JSX options only from the `bunfig.toml` of the directory it runs in,
  and nzyme's Vue `.tsx` tests need them when run from the product root. A `[test]` section
  (`preload`, `root`) is the repo's own; keep it.
- **`.gitattributes`:** LF everywhere and generated code marked `linguist-generated`. Add
  `*.pen binary linguist-generated` when the repo holds Pencil design files: they are never diffed or
  merged.
- **`.editorconfig`** matches `.oxfmtrc.json` (4 spaces; 2 for YAML, HTML and Vue), so an editor
  without the oxc extension writes what the formatter would.
- **`.gitignore`** covers build output, tool caches, generated files, env files and local agent
  files. Add per technology: `.wrangler/`, `.dev.vars`, `.dev.vars.*`, `!.dev.vars.example` for
  Cloudflare Workers; `target/` for Rust.

## Placeholders

- `{{name}}` — the root `package.json` `name`; in a new repo, ask once (lowercase, no scope).
- `{{scope}}` — the npm scope of the product's packages (`@<name>` unless the user says otherwise).
- `{{bunVersion}}` — `packageManager` in `nzyme/package.json`, without `bun@`.
- `{{version:<package>}}` — the specifier `nzyme/package.json` gives `<package>` (`devDependencies`,
  or `overrides` for `@types/bun`), copied as written, range included. The patch file name and its
  `patchedDependencies` key use the `@types/bun` version; copy the patch from `nzyme/patches/` under
  that name.

## Compare

- `package.json`: key-wise merge. Workspaces must be exactly `packages/*` plus `nzyme/packages/*`; a
  cherry-picked list of nzyme packages is a difference (nzyme packages depend on each other through
  `workspace:*`, so a partial list breaks on the next nzyme change). Every `@nzyme/*` dependency is
  `workspace:*`. Each toolchain version equals nzyme's; a drift is a difference even when newer. Repo
  dependencies and extra `overrides` stay.
- A hand-rolled tsconfig generator or committed `tsconfig.json` files: a difference — `nzyme monorepo`
  replaces them.
- `.gitignore`, `.gitattributes`: add the lines the asset has and the repo lacks; never remove the
  repo's.
- A missing `.editorconfig` or `bunfig.toml` is a whole-file difference.
- Turbo (`turbo.json`) instead of Nx: a difference owned by `references/nx.md`.
