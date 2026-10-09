# Code Index File Taxonomy & Indexer Architecture

> Recorded in the consuming healed monorepo, where nzyme is a git submodule, and moved here because the decision is about nzyme. Mentions of Healed describe the consumer the decision was made for.

## Status

Accepted

## Context

A coding agent working in this ~100-package monorepo has no fast, reliable map of the codebase. It re-derives structure by grepping every session and frequently reinvents utility functions that already exist. We decided to generate always-fresh, gitignored, regenerable Markdown index files at workspace setup (HLD-211). Two design questions needed a durable decision: (1) how to organize the index files (the file taxonomy an agent must learn), and (2) how to structure the indexer that produces them.

## Options Considered

### File taxonomy

- **Option A — Polymorphic `INDEX.md` + one global `UTILS.md`.** Two file kinds only: an `INDEX.md` (root hub + one per package, sectioned by whatever the package exposes) and a single global `UTILS.md`. Endpoints/entities are sections inside the owning package's `INDEX.md`. Trade-off: the agent must learn that `INDEX.md` is "polymorphic" (varies by package) — but that is one intuitive rule.
- **Option B — Separate typed files (`ENDPOINTS.md`, `SCHEMA.md`, …).** A dedicated file per symbol category. Trade-off: a consolidated cross-cutting view per category, but more file *types* the agent must know, more files, more gitignore surface, and (for endpoints) a global view the team explicitly did not want (patient/doctor surfaces are distinct).

### Indexer architecture (Design It Twice — three divergent designs)

- **Minimal (A):** one command, one flat kind-tagged `IndexSymbol`, two pure functions, two `switch`es. Trade-off: smallest surface; bespoke kinds edit shared switches.
- **Common-case (C):** a declarative `SYMBOL_KINDS` table driving one generic `defineX` extractor + 3 bespoke extractors. Trade-off: "add a kind" is a one-line row; bespoke kinds get no table leverage (by design).
- **Flexible (B):** normalized IR + `Extractor`/`Renderer` registries + a CLI-decoupled core + open `SymbolKind` + a JSON format seam. Trade-off (self-flagged): over-built for a fixed set of ~8 known kinds; open union loses compile-time exhaustiveness; seams serve consumers that don't exist.

## Decision

**Taxonomy: Option A.** Organizing principle — *cross-cutting, whole-repo reuse → one global file (`UTILS.md`); package/app-scoped structure → that package's `INDEX.md`.* Underuse of utilities is a repo-wide problem, so helpers get a global catalogue; endpoints/services/entities are package-scoped, so they are sections in the owning package's `INDEX.md`. No separate `ENDPOINTS.md`/`SCHEMA.md`. This gives the agent the smallest vocabulary: two file kinds.

`UTILS.md` was refined to be a **curated global subset**, not every `@util` helper in the repo: it lists only helpers from a handful of foundational packages (`@healed/common`, `@healed/utils`, `@nzyme/utils`, `@nzyme/i18n`, `@nzyme/crypto`) whose context-agnostic nature makes them worth surfacing repo-wide. Every package's own `@util` helpers — foundational or not — still appear in that package's `INDEX.md`, under a dedicated Utils section, so nothing is lost; only the repo-wide catalogue narrows to what is broadly reusable enough to justify the cross-cutting visibility.

**Architecture: hybrid A+C** — the minimal skeleton (one `IndexCommand`, one flat `IndexSymbol` with a **closed** `IndexSymbolKind` union, pure `collectSymbols` → `renderMarkdown`), with C's declarative `SYMBOL_KINDS` table for the five `defineX` kinds (it makes "add a section" a one-line row and absorbs the `defineActor` `type:`-vs-`name:` divergence as a `nameKey` column). Three bespoke extractors (`@util`, `.vue` component, `pgTable` entity) for the genuinely different shapes. We reject B's registry/IR/format machinery.

Parsing uses the `typescript` compiler API **syntax-only** (no type-check) for speed and cold-checkout safety; a string prefilter selects candidate files before parsing. Generated files (root `INDEX.md`/`UTILS.md` in the main repo; per-package `INDEX.md` in both the main repo and the `nzyme` submodule) are gitignored in their respective trees.

## Consequences

**Gained:** a two-file-kind mental model that is one sentence to teach; compile-time exhaustiveness (a forgotten kind is a `tsc` error, not a silent gap); a one-line change to add a future `defineX` section; a fast, high-concurrency indexer with no speculative abstraction; and reuse of `collectSymbols` as the natural seam if a JSON output or a lint rule is ever needed.

**Accepted downsides:** `INDEX.md` is polymorphic, so a reader must know its content varies by package. A bespoke symbol kind (not a `defineX`) requires a hand-written extractor rather than a table row. The flat `IndexSymbol` is a lowest-common-denominator record — kind-specific richness beyond name/path/description/signature would require revisiting the model. Extending generated files into the `nzyme` submodule means the submodule's `.gitignore` and content edits are pushed via `bun task push`.

## Update — moved into `@nzyme/cli`

The indexer now lives in `@nzyme/cli` as `nzyme index`, so nzyme and every consumer generate the same
index. What was hard-coded for Healed became the `nzyme.index` field of the root `package.json`: the
packages feeding `UTILS.md` (`globalUtilPackages`), extra `defineX` kinds such as `defineActor`
(`defineKinds`), and table-based entities (`entities`). The built-in kinds — services, commands,
factories, endpoints, components and `@util` helpers — need no configuration. Duplicate names are
now ordered by import path, so the output no longer depends on crawl order.
