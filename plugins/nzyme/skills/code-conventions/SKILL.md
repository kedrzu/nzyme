---
name: code-conventions
description: >-
    TypeScript and Vue conventions for code built on the @nzyme packages — file organization and
    naming, function ordering, style, casting, imports, JSDoc (what counts as public API, the
    `@__NO_SIDE_EFFECTS__` annotation), Vue SFC script order and BEM class naming, and the design
    principles. Use whenever you write, refactor or review TypeScript or Vue code in a repository that
    depends on @nzyme/*: naming a file or export, ordering functions, spotting a code-smell cast,
    writing JSDoc, or pointing at code from a comment or doc. Not for: dependency-injection wiring and
    the `*Command.ts`/`*Service.ts` role suffixes (ioc skill).
---

# Code conventions

## Code organization

- **Cohesion decides what shares a file, not export count.** Code that changes together and is used
  only together belongs in one file — splitting it buys a file, an import and a name, and pays nothing
  back.
- **One export per file, file name = export name — for independent, reused exports**, i.e. anything
  another module imports on its own terms. A same-name interface + const pair (declaration merging)
  counts as one export. The groups below illustrate the principle; apply it to cases not named here:
  - an exported function and its params/options interface;
  - a service or command and the types used only by it — its private shapes sit beside it, not in
    five files of five lines each (its published contract: see the ioc skill);
  - several small related types that are read and changed as a set, in one `*Types.ts`;
  - a Vue component, its props, and types that belong only to that component;
  - enums and their translations;
  - a constant used by a single module, declared in that module. A file whose entire content is one
    exported constant is the anti-example — never create one.
- **Function order: high → low abstraction** — caller before callee.
- **In closures, define functions AFTER the `return`** and rely on hoisting — the returned shape reads
  first.
- **Plain function declarations, not arrow-function variables.**
- **Don't abstract a helper with exactly one caller** — inline it; extraction earns its keep through
  reuse.
- **Co-locate single-consumer utilities with their consumer's package**; reserve shared packages for
  concerns used by 2+ packages.
- **Don't mutate function arguments** — work on a copy and return the result; callers capture it.
- A single type earns its own file once a second module needs it.

File-name suffixes for IoC and RPC units (`*Command.ts`, `*Service.ts`, `*Endpoint.ts`,
`*EndpointHandler.ts`, …) are owned by the ioc skill.

## Style

- Import `.ts` files with the `.js` extension (`./formatPrice.js`); `.tsx` as `.jsx`.
- `for...of` loops, not `forEach`/`reduce`.
- `switch/case` for multiple conditions on the same value.
- `const` over `let` when not reassigned.
- **3+ params → one object typed by a named, exported `[FuncName]Params` or `[FuncName]Options`
  interface** — also below 3 when it reads better. No inline object types or intersections in
  signatures.
- Never `any`. Use `!= null` (not a truthy check) for optional numbers — truthy drops a valid `0`.
- No redundant expressions: no `?? undefined` on an already-optional value; no `String()` around both
  sides of a `bigint` comparison.
- Name functions by what they do (`readData` and `handleStuff` say nothing); split multi-purpose ones.
- `map.has(key)` for presence, not `map.get(key) !== undefined` — the latter misreads a stored
  `undefined` as absent.
- Prefer discriminated unions over generic `kind`-indexed parameter types. Classify a closed union with
  an exhaustive `switch` and `assertNever(value)` (`@nzyme/utils/assertNever.js`) in `default`, not a
  `Set`/array allowlist.
- Guard `value === null` before `typeof` dispatch — `typeof null === 'object'`.
- Narrow with `assert(value)` / `assertValue(value)` from `@nzyme/utils/assert.js` instead of `!` in
  production code.
- PascalCase for exported global-like singletons and registries; camelCase for ordinary variables.
- `fs-extra` does not re-export the `fs` functions (its types claim it does) — use it only for its own
  helpers and `node:fs/promises` for everything else.

## Casting & types — a cast is usually a smell

- Reaching for `any` or an ugly cast means you are going the wrong way — investigate the cause.
- Never `as` to reach a property that narrowing should expose (e.g. after a `switch` on the
  discriminant) — fix the type definitions instead.
- Never cast to an inline object type (`as { foo: number }`) — import the real exported interface.
  Inline shapes drift silently when the real type changes, leaving callers and tests passing against a
  stale contract. Applies to test helpers too.
- When a definition exports a value type, use it — don't derive it via `ReturnType<...>['field']` or a
  local alias that only renames it.

## Documentation — JSDoc and code references

**Document all public code.** Public means any node matched by these AST selectors:

- `ClassDeclaration`, `ClassProperty`, `MethodDefinition`
- `FunctionDeclaration`, `TSDeclareFunction` — and document **each overload** separately
- `ExportNamedDeclaration > VariableDeclaration`
- `TSEnumDeclaration`, `TSInterfaceDeclaration`, `TSTypeAliasDeclaration`
- `TSMethodSignature`, `:not(TSTypeParameterDeclaration) TSPropertySignature`

Don't document the internal functions declared inside a service, command or component scope.

- WHY over WHAT — explain intent and non-obvious behavior; skip what the name and types already say.
  Document a property only when its purpose isn't evident from the name.
- 1–2 lines for simple functions; `@param`/`@returns` only when not obvious from the types. No
  redundant JSDoc type annotations — TypeScript has them.
- Skip trivial getters, re-exports and type-only files whose names are self-documenting.
- Leave existing lint-disable comments where they are — directly under the JSDoc block.
- If the repo generates a code index from JSDoc (see Design principles), tag context-agnostic,
  reusable helpers with `@util` so they are listed.

### `@__NO_SIDE_EFFECTS__`

Put `@__NO_SIDE_EFFECTS__` on pure function declarations — `get…`, `define…`, `create…`, formatters,
parsers — as the last line of the **same** JSDoc block as the description (a second stacked block
silently drops the description). Every `define*` in `@nzyme/ioc` carries it, which is what lets
unused services tree-shake away.

The annotation promises the bundler that **deleting a call whose result is unused changes nothing
observable** — and Rollup takes it literally: it drops such calls from the bundle while unbundled tests
stay green, so a wrongly annotated function silently stops running in production. A function that
exists *for* its effect must not carry it: an assert or validator whose point is the throw, a
`provide`, a write, a cache or counter update, anything doing I/O. A function that returns a value and
merely throws on invalid input may.

`nzyme/no-unused-no-side-effects-result` (from `@nzyme/oxlint`) enforces the other half: it reports a
call to an annotated function whose result nothing consumes — either dead code or proof the annotation
is wrong. It has no autofix on purpose: use the result, delete the call, or drop the annotation.

### Point at code by symbol, never by line number

Write `resolveDeps()` in `packages/ioc/src/utils/resolveDeps.ts`, never `resolveDeps.ts:12`. Nobody
maintains line numbers: the file moves and the next reader lands on unrelated code, unable to tell
whether the pointer or the claim went stale. A `git show <sha>`, a path in someone's local clone or a
bare ticket id is worse — never openable at all. State the mechanism in the text itself, so the pointer
is provenance you could drop. This applies to anything that outlives the turn — a comment, JSDoc, a
skill, an ADR, a docs page. `file:line` is fine in text read once: a review comment, a chat reply.

## Imports

Import `@nzyme/*` APIs by file path — `import { defineService } from '@nzyme/ioc/Service.js'` — every
package exports `./*.js` and names each file after its export. The exception is `@nzyme/crypto`, which
exports only `.`, `./node` and `./browser`: import from `@nzyme/crypto` (or `/node`, `/browser`), never
by file path, whatever `UTILS.md` lists. Nothing sorts imports for you, so keep a
touched file's existing order rather than reordering it: builtin, then external, then internal
(`@nzyme/*` and the repo's own scope), then relative, with a blank line between groups.

## Vue SFCs

- `<script setup>` order: composables (`use*`), refs and other state first; then lifecycle hooks
  (`onMounted`, …); functions last, as plain declarations, relying on hoisting.
- Styles: BEM with a **single `_` separator** (not `__`) and camelCase names — `.productCard`,
  `.productCard_title`, `.productCard_active`. Avoid deep nesting.

## Design principles

- Write complete code — no skipped implementations or TODOs.
- Don't repeat code — extract a utility. Before writing one, check for an existing helper: if the repo
  has a generated code index (a root `INDEX.md`/`UTILS.md`, e.g. from a `bun run index` script), read
  it first, and check `@nzyme/utils`, `@nzyme/vue-utils` and `@nzyme/dom-utils`. Reuse beats reinvent.
- No performance optimizations (caching, pooling, memoization) without profiling evidence.
- No config, enum variants or branches that no caller exercises yet.
- No generic registration/plugin abstraction for a handful of known cases — use a `switch`.
- No injectable or `defineEnvVariable()` wrapper for a fixed internal constant (cache size, timeout,
  retry count) — a plain `const`.
- Don't spread one logical decision across several env/config predicates — collapse them into one
  named predicate.
