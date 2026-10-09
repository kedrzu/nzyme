# Lint and format owned per repository

## Status

Accepted

## Context

nzyme is a submodule of several product monorepos and keeps its own oxlint, oxfmt and ESLint
configuration. Until now the main consumer linted the nzyme tree from its own root and relied on
oxlint's nested-config discovery to apply `nzyme/.oxlintrc.json` there. Formatting went the same way.
The product's tooling therefore decided which nzyme files were checked and when. A product's
lint run could fail on nzyme code, and a product's `format` could rewrite nzyme files that are then
committed in a different repository.

The goal is that every repository — nzyme and each product — lints and formats only its own tree
with its own configuration, and evolves it independently.

> **Checked 2026-10-06** in a product layout with `nzyme/packages/*` in the product's workspaces,
> dependencies hoisted to the product and no `nzyme/node_modules`:
>
> - `bun run lint:check` and `bun run format:check` run inside `nzyme/` (or as `bun run --cwd nzyme …`)
>   apply nzyme's configuration. A probe file was reported by type-aware rules (`no-explicit-any`), the
>   preset (`curly`) and oxfmt. The `@nzyme/oxlint` JS plugin loads.
> - A product `.oxlintrc.json` / `.oxfmtrc.json` with `nzyme/**` in `ignorePatterns` still linted and
>   format-checked the probe. The nested nzyme config replaces the product's config for that subtree,
>   ignore list included.
> - With `--disable-nested-config` (oxlint and oxfmt), or `--ignore-pattern` / `--ignore-path`, the
>   product skipped `nzyme/` entirely. ESLint (kept only for Vue rules
>   that oxlint does not cover) needed just `globalIgnores(['nzyme/**'])`: ignoring the directory
>   stops a directory run from reaching `nzyme/`, so its nested `eslint.config.mjs` is never used.

## Options Considered

- **Option A — one configuration from the top.** The product lints and formats everything, nzyme
  included. Trade-off: one command, but nzyme's rules are whatever the product's run happens to apply,
  and a product formatter writes into another repository.
- **Option B — nested-config delegation (status quo).** The product lints everything and oxlint swaps
  in nzyme's config for its subtree. Trade-off: nzyme's rules apply, but the product still runs them,
  fails on nzyme findings, and formats nzyme files.
- **Option C — each repository owns its tree.** The product excludes the submodule from its own runs
  and calls nzyme's scripts when it wants the submodule checked. Trade-off: two invocations, and the
  exclusion needs `--disable-nested-config` (or an explicit ignore flag), not only a config entry.

## Decision

Option C.

- nzyme's configuration stays self-contained and works in place inside a product. The preset is
  extended by relative path, and plugins resolve through the product's hoisted `node_modules`.
- Products exclude the submodule:
  - an `ignorePatterns`/`globalIgnores` entry in each config;
  - `--disable-nested-config` (or an explicit ignore flag) on their oxlint and oxfmt CLI runs;
  - `--exclude` for `nzyme format-markdown`.
- Products run nzyme's own `lint:check`/`format:check` (`bun run --cwd nzyme …`) when they want it
  checked. nzyme's CI checks it anyway.
- Editors keep nested-config discovery, so files opened under `nzyme/` get nzyme's rules.

The exact product setup is in [docs/consumers.md](../consumers.md#lint-and-format).

## Consequences

- **Gained:** independent rule evolution per repository; no cross-repository formatting writes; a
  product's lint result says nothing about nzyme's code, and vice versa.
- **Accepted:**
  - The flag requirement is easy to miss, since a config-only exclusion looks right and silently does
    nothing. `docs/consumers.md` states it explicitly.
  - Linting nzyme in place needs the product's build first (the oxlint plugin loads from `dist`).
