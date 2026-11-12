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
|`.gitignore`|`assets/gitignore.tmpl`|the lines for what every nzyme repo produces|
|`.gitattributes`|`assets/gitattributes.tmpl`|every line|
|`.editorconfig`|`assets/editorconfig.tmpl`|the whole file|
|`patches/bun-types@<version>.patch`|copied from `nzyme/patches/`|the file and its `patchedDependencies` entry|

- **Names:** the root package is the product name (`{{name}}`, no scope); every package is
  `{{scope}}/<package>` in `packages/<package>`; the root Nx project is `{{name}}-root`
  (`assets/project.json.tmpl`, `references/nx.md`).
- **Workspaces, `workspace:*` dependencies, the toolchain versions and the `bun-types` patch:**
  `docs/submodule-setup.md#workspace-and-dependencies`.
- **`tsconfig.esm.json` is the only committed root tsconfig.** `nzyme monorepo` generates every
  `tsconfig.json`, which stays gitignored: `docs/submodule-setup.md#typescript-and-generated-files`.
  A directory whose tsconfig is hand-written (a Nuxt app extending `.nuxt/tsconfig.json`, `scripts/`
  for the Nx guard test) un-ignores it in its own `.gitignore`: `!tsconfig.json`.
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
- **`.gitignore` lists what this repo actually produces**, nothing from a catalogue. The asset holds
  what every nzyme repo produces: dependencies, `dist`, tool caches, nzyme's generated files, env
  files, `CLAUDE.local.md`, `.context/`. Everything else is added when the repo has its source:
  - **Owned by one directory → that directory's own `.gitignore`**, never a nested path in the root
    one: a Nuxt app ignores `.nuxt/` and `.output/` in `packages/<app>/.gitignore`, the UI package
    ignores `storybook-static/` when it builds Storybook, `packages/e2e/.gitignore` ignores
    `test-results/` and `playwright-report/`, `.claude/.gitignore` ignores `settings.local.json` and
    `worktrees/` (`assets/claude-gitignore.tmpl`). The rule moves and disappears with the directory.
  - **Produced anywhere in the tree → the root**, e.g. `.wrangler/`, `.dev.vars`, `.dev.vars.*` for
    Cloudflare Workers; `target/` for Rust; `.playwright-mcp/` when agents use the Playwright MCP;
    `!.env.example` when the repo commits one.
  - **Editor files** (`.idea/`, swap files) come from a developer's machine, not the project: they
    belong in that developer's global gitignore (`core.excludesFile`). `.DS_Store` is the exception
    and sits in the root `.gitignore`: macOS writes one into every directory Finder opens, on every
    Mac, so a `git add -A` or a tool committing untracked files sweeps them in, and `nzyme git affected`
    reads an untracked `.DS_Store` as a changed file. `.vscode/` holds the repo's shared settings and
    is committed (`references/vscode.md`).

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
- `.gitignore`: a missing asset line, or a missing entry for an output the repo does produce, is a
  difference. So is a line nothing in the repo produces (a leftover, a copied catalogue, OS or editor
  files), and a nested path that belongs in that directory's own `.gitignore`: propose removing or
  moving it. Check with `git check-ignore --no-index -v <path>` before claiming a file is or is not
  covered.
- `.gitattributes`: add the lines the asset has and the repo lacks; never remove the repo's.
- A missing `.editorconfig` or `bunfig.toml` is a whole-file difference.
- Turbo (`turbo.json`) instead of Nx: a difference owned by `references/nx.md`.
