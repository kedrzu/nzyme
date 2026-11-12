# File-level affected selection by one full import scan

## Status

Accepted

## Context

A consumer's scoped verification (healed's `verify:scoped`) narrowed tests to **packages**: Nx
listed the packages a change touched plus their dependents, and every `*.test.ts` in them ran. A
change to one file of a foundational package ran practically the whole suite. Stories and component
tests were not scoped at all, the base was hard-wired to `origin/main`, and the mechanism was
consumer-specific bash although other nzyme consumers need the same thing.

`nzyme git affected <pattern…> [-- <cmd…>]` selects files instead: the files changed against a base,
plus everything importing them, transitively, filtered by the patterns (`*.test.ts`,
`packages/ui/src/**/*.stories.tsx`). Three questions decide its shape: how the importers of a change
are found, what to do about dependencies imports do not show, and which base a change is measured
against.

> **Measured 2026-11-10 on healed** (about 4.2k `.ts/.tsx/.vue` files, 6,024 walked files): one
> `buildImportGraph` scan — walk, regex extraction, resolution, reverse edges — takes 0.20–0.26 s
> and yields 6,241 nodes and about 16.6k edges. Finding the importers of one file with `git grep`
> costs about 65 ms, and a change to a hub file fans out to thousands of transitive importers, so
> per-file grepping takes minutes.

## Options Considered

- **Option A — per-file `git grep` for importers, recursively.** Search for each changed file's
  importers, then theirs. Trade-off: no graph code, but the cost grows with the fan-out of the
  change — minutes for a hub (the measurement above) — and a specifier has to be matched by text,
  which misses package-name imports, aliases and `index` resolution.
- **Option B — package-level selection through the workspace graph (Nx).** Trade-off: already
  existed and is cheap, but one changed file runs every test of every dependent package — the
  problem this replaces.
- **Option C — one full scan of every source file into a reverse import graph, then a
  breadth-first walk from the changed files.** Trade-off: the scan costs the same for a one-line and
  a thousand-file change, and the parser must know every import form a project uses.

## Decision

Option C. A fixed 0.2–0.3 s scan beats a cost that scales with the change, and resolving real
specifiers (relative, workspace `exports` with the `source` condition, configured aliases) is
correct where text matching is not. The graph is `buildImportGraph` in `@nzyme/project-utils`, also
used by healed's architecture check, so one parser serves both.

- **Implicit dependencies are parsed, not banned.** Vue `<script|template|style src>`, Sass
  `@use`/`@import`/`@forward` and `new URL('literal', import.meta.url)` naming a file are edges. A
  URL naming a directory is no edge — an edge to every file under it would make a file depend on a
  whole package; a changed file there falls to the package fallback below. No lint rule
  forbids other implicit forms; the residue is covered by conservative fallbacks: full-run triggers
  (lockfile, tsconfig, test-runner config), a package's `package.json` standing for all its sources,
  and a changed non-source file nothing imports (a fixture read through `fs`) selecting every
  matching file of its package.
- **Generated sources come in through `rewrites`, not from disk.** The walk skips gitignored files
  and the graph never reads one. A `rewrites` rule (`.loc.yaml` → `.loc.ts`) maps a changed source
  onto its generated file, and that target joins the resolvable paths for the one scan, so its
  importers are found. Parsing generated files would add no edge worth having: a `.loc.ts` imports
  only a type from `@nzyme/i18n`. Rewrites are suffix → suffix — the smallest syntax covering the known cases (`.handler.ts` →
  `.ts`, `.loc.yaml` → `.loc.ts`). A file that matched a rewrite skips the package fallback: the rule
  names its dependents.
- **Type-only imports count.** Bun erases them, so they over-select; the selection stays
  conservative for now; edges do not record whether an import is type-only, and dropping type-only
  edges would be a separate optimisation. Changed `.d.ts` files, in contrast, select nothing and are not even seeds:
  a declaration file is never executed, its consumers are type-level only, and the typecheck covers
  it.
- **Triggers and `ignore` match the root-relative path; only selection patterns match a basename.**
  A trigger `package.json` is then the root manifest and nothing else, so a package's own
  `package.json` can mean "this package's sources changed" instead of "run everything". A trigger
  meant for every directory says so: `**/tsconfig*.json`. Triggers win over `ignore`.
- **`ignore` is about changes, not graph nodes.** It is not passed to the graph walk: an ignored path
  (`docs/**`) can still be imported, and pruning it would cut the chain from a change to its tests.
  It only means "a change of this file selects nothing".
- **Base.** Explicit `--base` (`-b`), then the GitHub Actions pull request base or
  push `before`, otherwise the nearest merge-base among the configured trunks (`baseBranches`, as `origin/<name>`).
  *Measured 2026-11-10:* the auto detection costs 35 ms for three candidates. An unresolvable base
  fails the command; it never yields an empty selection. The resolution lives in one place,
  `resolveAffectedBase()` in `@nzyme/project-utils`, and `nzyme git base` prints its ref: a
  script that scopes other checks to the change (formatting, a typecheck) takes the base from there
  and hands it back as `--base`, so every check measures the same change.
- **E2E is out of scope.** A spec reaches the code through a browser and HTTP, which the graph
  cannot see; e2e keeps running in full.

## Consequences

- One changed leaf file runs the tests importing it, not its package's suite, and stories and
  component tests are scoped per package with `--per-package`.
- The scan costs about 0.25 s on every run, even for a tiny change; no cache, since nothing showed
  it is needed.
- An import form the parser does not know is a silent miss. The fallbacks catch non-source files,
  not a source file imported in an unknown way — a new implicit form needs parser support or a
  trigger.
- A consumer configures its trunks, aliases, rewrites, triggers and ignored paths under
  `nzyme.affected` in its root `package.json`; without it the defaults (`baseBranches: ["main"]`,
  nothing else) apply.
