# Module state declared by `@__NO_SIDE_EFFECTS__`

## Status

Accepted

## Context

Test selection from recorded variants (`variant-based-test-selection.md`) attributes lazy
initialisation and memoisation to the test that ran them first and assumes code tested once works for
the next caller. State that outlives a call can break that: a test may pass only because an earlier test
primed a cache or a registry, and its variant then lacks the code that did it. Such state lives at
module level, so it has to be visible there: everything a module creates at load time is either
immutable or made by a factory someone has vouched for.

> **Measured 2026-11-16 in a spike on a consuming project's e2e stack** (717 modules):
> about 13 places hold module-level state — constant sets, memoisation caches, two `let`s and one
> registry. Top-level initialisers call 63 distinct functions, most of them `define*` factories and
> `z.*` schema builders.

> **Checked 2026-11-17:** before this rule, `@__NO_SIDE_EFFECTS__` already appeared 772 times in the
> `packages/` sources of healed and nzyme, including `defineService` (`packages/ioc/src/Service.ts`), and `@nzyme/oxlint` already reads it across
> modules (`noUnusedNoSideEffectsResult`, through `resolveImportSpecifier`).

## Options Considered

- **A closed allowlist of factories in the rule** (`createCache`, `defineService`, …). Trade-off: no
  annotation work, but every consumer's own factories need a config entry, and the list goes stale.
- **Allow calls by name** (`define*`, `create*`). Trade-off: zero configuration, but a name promises
  nothing — a `defineRegistry` that pushes into a module array passes. Rejected by the maintainer: the
  declaration decides, not the name.
- **Allow calls to functions declared `@__NO_SIDE_EFFECTS__`**, read from the declaration across modules,
  plus immutable values and listed external packages. Trade-off: authors annotate their factories, and
  a false annotation also misleads bundlers' tree-shaking.

## Decision

The `nzyme/no-module-state` oxlint rule (`packages/oxlint/src/noModuleState.ts`). At a module's top
level it allows:

- functions, primitives and immutable values: `as const` or `Immutable<…>` (`@nzyme/types`), which are
  deep, and `Object.freeze`, `Readonly<…>`, `readonly T[]`, `ReadonlyMap` and `ReadonlySet`, which are
  shallow (`ReadonlyMap`/`ReadonlySet` for collections, since `Readonly<Map>` still allows `.set()`).
  A literal nested under a shallow value is reported unless it is immutable on its own;
- calls to functions whose declaration carries `@__NO_SIDE_EFFECTS__` — the author vouches the function is
  idempotent and tested; `createCache`/`createMemo` of `@nzyme/utils` are the declared way to cache;
- calls into packages listed in `externalPackages` (`zod`, `drizzle-orm/pg-core`, or one export:
  `effect#Context`), which cannot be annotated; a member chain or curried call counts when it starts there.

It rejects `let`/`var`, mutable literals and collections, undeclared calls, load-time statements and
mutable static fields. TypeScript then refuses writes to what the rule let through as immutable, to the depth the value
declares.

Exclusions live in each repository's config, with a reason, not in the rule: test and spec files (the unit
a selection runs or skips whole), `.vue` files (`<script setup>` runs per instance), tool config files,
process entry points (a process's top level is its `main`), and command classes whose framework declares
static fields mutable. Process-wide state that must stay is disabled at the line with a comment saying
why.

## Consequences

- New module-level state is either declared or visible in a review as a disable comment.
- Annotating a factory is part of writing one; a misspelt annotation is silently ignored by both the
  rule and bundlers.
- The rule narrows what the trust assumption covers but does not prove it: `bun e2e:full`'s tracing-gap
  report remains the check.
