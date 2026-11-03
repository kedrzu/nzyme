# Package Update Notes

Last updated: 2026-11-03

Read by every dependency update that touches this repository — a run started here, or one started in
a project that consumes nzyme as a submodule. Entries never name a consumer: one that holds nzyme
back is described by the dependency that conflicts and the mechanism.

## General Rules

Persistent constraints that hold whatever the version: couplings ("update only together with Y",
"must match the version X bundles"), the reason behind each root `overrides` entry, and the
project's own procedures — a container image or tool version pinned outside the package manager and
how to bump it, how to collapse duplicate dependency trees, which bumps need a rebuild or a restart.
One `###` per package. Remove an entry only when its constraint is gone.

### crossws / h3 — Nitro's versions, not ours

`packages/logging-ui` declares `crossws`, and its server routes (`server/routes/*`,
`defineWebSocketHandler`) import `h3`. Both run inside the Nitro that the consumer's Nuxt bundles, so
the versions must be the ones that Nitro resolves; a different one installs a second copy whose types
the routes compile against while Nitro executes the first. Nuxt 4.4.8 resolves Nitro 2.13.4, which
declares `crossws: ^0.3.5` and h3 1.x — hence `crossws` 0.3.5, and no `h3` declaration of our own.
Move `crossws` only together with `nuxt`, to the version that Nuxt's Nitro resolves.

### rollup

`packages/pulumi` uses `rollup-plugin-bundle-stats`, which **hard-pins** (exact, not a range)
`rollup-plugin-stats`, which in turn vendors its own copy of rollup's `OutputBundle` / `SourceMap`
types. rollup can therefore only move to versions whose type shapes still match that vendored copy,
and there is no independent upgrade path — `rollup-plugin-bundle-stats` must ship a bump first.
See the Known Issue for the current wall.

### typescript / @typescript/native-preview (stay on native-preview)

The packages build with `@typescript/native-preview` (bin **`tsgo`**), NOT the official
`typescript@7` release. The official `typescript@7` package (a) ships bin **`tsc`** — the same name as
the classic `typescript@6` JS compiler — and (b) drops the classic JS compiler API (its main entry is
`./lib/version.cjs`; it only exposes experimental `./unstable/*`). Tools here still need that classic
API and have no TS7-compatible release: `@typescript-eslint/parser` in `packages/eslint` (through
`typescript-estree`), `vue-tsc` in `packages/logging-ui`, `vite-plugin-checker` in
`packages/rollup-utils`, and `packages/cli`'s code index (`import ts from 'typescript'`). So classic
`typescript@6` stays the resolvable `typescript` module, and native-preview's distinct `tsgo` name is
what lets the native compiler coexist with it.

That 7.0 has no API is deliberate, and upstream names this side-by-side arrangement as the intended
one for 7.0 — it is not a workaround awaiting a fix. The target is **7.1**, which carries the new API
and content mappers: migrate in one step once typescript-eslint and vue-tsc ship releases built
against it. The Known Issues track both projects' work and the failed 7.0 coexistence attempt.

### @types/bun / bun-types / `packageManager` — one version, three places

The root `overrides` entry for `@types/bun` is a single-copy guarantee; move it with the workspace
ranges. `@types/bun`, the `packageManager` bun pin and the patched `bun-types` move in lockstep — all
three or none. Taking `@types/bun` alone desyncs the types from the bun runtime and strands the patch.

`bun-types` is pinned through `patchedDependencies` (`patches/bun-types@<version>.patch`). The patch
types every `expect(...).rejects` / `.resolves` matcher as returning a promise — upstream types them
`void`, which trips `await-thenable` on every awaited rejection assertion. The patch is keyed to the
exact version, so a bump re-creates it:

```bash
bun patch bun-types@<new-version>
# re-apply the PromiseMatchers edit in node_modules/bun-types/test.d.ts
bun patch --commit 'node_modules/bun-types'
rm patches/bun-types@<old-version>.patch
```

**A stale patch fails silently**: `bun install` with a `patchedDependencies` key matching no
installed version exits 0 and applies nothing; lint then reports `await-thenable` on awaited
`.rejects` assertions. Do not disable the rule. Before re-applying, check whether upstream fixed it:
`npm pack bun-types@<version>` then `grep -nE '^\s+(resolves|rejects):' package/test.d.ts` — if
`rejects` is no longer `Matchers<unknown>`, drop the patch instead of porting it.

`bun upgrade` has no target-version flag; install an exact bun with
`curl -fsSL https://bun.sh/install | bash -s "bun-v<version>"`.

**1.4.3 narrowed `expect()`'s zero-argument overload** to `(): Matchers<undefined>`. `expect(x)` with
`x` typed `never` now yields `Matchers<never>`, so `toBe(undefined)` is a TS2769. It hit
`packages/utils/src/toJson.test.ts`, where `Json<Function>` is deliberately `never` while the runtime
value is `undefined`. Use an argument-free matcher (`toBeUndefined()`) whenever the asserted value's
type is `never` by design; do not widen the type.

### The root manifest is invisible to a consumer's `bun outdated -r`

A consumer puts `nzyme/packages/*` in its workspaces, never `nzyme/` itself, so this repository's
**root** `package.json` is in no consumer's workspace graph and `bun outdated -r` run there never
reports it. Its dev toolchain therefore drifts silently while every package manifest stays current —
found on 2026-11-02 at `oxfmt` 0.72.0, `oxlint` 1.86.0 and `eslint` 10.12.0 against package-level
pins already three releases ahead.

A consumer's run cannot verify these either: it never installs this root's `devDependencies`, so its
in-place `lint` and `format` resolve the binaries from the consumer's own hoisted copy. Aligning them
is still correct — it is what standalone development and this repository's CI use — and **the nzyme
PR's own CI is their verification**, not the consumer's protocol.

So a run started in a consumer checks this manifest explicitly, with `bun outdated` from `nzyme/`,
and treats anything only this root declares (`nx`, `@swc/core`, `@swc-node/register`, `del-cli`) as
nzyme-side work: either a batch proven by this repository's CI, or an escalation. Never bump one of
those blind and call it verified because the consumer's protocol was green.

### nx — through `nx migrate`, and keep `nx.json`'s comments

Move `nx` and `@nx/js` with `nx migrate <version>`, `bun install`, then
`nx migrate --run-migrations`, and delete the generated `migrations.json` and `tools/ai-migrations/`.
Without a terminal the first command stops at an Nx Cloud prompt after writing its files; nothing here
uses Nx Cloud, so ignore it.

A migration that edits `nx.json` rewrites it as plain JSON and **drops every comment** (seen with
24.0.3). Restore the file and apply the change by hand. `nx migrate` also pins exact versions; the root
keeps `nx` and `@nx/js` as `^` ranges.

`nx.json` sets `affected.legacy: true`, what the Nx 24 migration writes: `nx affected` selects whole
projects, as before 24. Deleting it switches to task-based selection, where a test-only edit no longer
rebuilds the package. The owner's decision (2026-11-03): keep it for now, and try the switch as a
separate change. It affects only the scoped `verify` step, so an update run need not raise it again.

`nx release` runs only on the `release` branch, so nothing on a PR exercises it. After an Nx bump run
`nx release version --dry-run` and `nx release changelog <next> --dry-run` by hand.

### Moving a locked version inside its range

`bun install` does not re-resolve a range the lockfile already satisfies, and a bare `bun update`
would take `nuxt`, `vite` and `rollup` past their walls, since their ranges allow it. To move one
package and leave its published range alone: pin the exact version in each workspace that declares it,
`bun install`, restore the manifests, `bun install` again.

Compare the lockfile's keys before and after; a pinned move can leave a nested second copy behind.
**Never delete entries from `bun.lock` to force a re-resolve.** Deleting the `@babel/*` 8.x entries
re-resolved the whole file, downgrading `@aws-sdk/abort-controller` among others. Deleting only the
nested ones left `@babel/helper-globals` with no 8.x entry, and `packages/pulumi` tests failed inside
`@babel/traverse` 7.29.8 with this error (the exact mechanism was not traced; the same versions pass
without the deletion):
`Spread syntax requires ...iterable[Symbol.iterator] to be a function`.

### vitest — all `@vitest/*` move together

`vitest`, `@vitest/browser`, `@vitest/browser-playwright` and `@vitest/expect` move as one.
`packages/vitest` merges its custom matchers into vitest's `Assertion` interface
(`src/index.ts`), so a vitest major that changes `Assertion`'s type parameters fails `tsgo --build`
there with `TS2428: All declarations of 'Assertion' must have identical type parameters` until the
declaration repeats the new parameter list. Keep that interface on ONE line — splitting it moves the
`{}` out from under its `eslint-disable-next-line @typescript-eslint/no-empty-object-type` comment.

## Known Issues

Version-specific failures from past attempts. Never retry a listed version; delete the entry when a
newer version fixes it. One `###` per package and attempted version. A `blocked-by-consumer` entry is
never retried from inside this repository — only a run in a consumer can show it fixed.

### nuxt 4.5+ / vite 8 (attempted by a consumer 2026-10-26, reverted; re-checked 2026-11-02)

- **Problem**: a consumer is held on nuxt 4.4.8 and vite 7. nuxt 4.6 requires vite 8 (`@nuxt/vite-builder@4.6.2` depends on `vite: ^8.3.4`), and vite 8's bundler drops environment-gated branches from **dynamically imported** chunks even when the gate is true. A consumer that gates lazily-loaded, non-production-only code on build-time environment constants loses that code from its non-production builds.
- **Error**: in the consumer's tree-shaking test, the lazy chunk builds down to its unconditional marker; both guarded markers are eliminated, while the entry chunk is correct. It happens with `minify: false` too, so it is the bundler, not terser. Typecheck and app builds stay green.
- **Status**: blocked-by-consumer
- **Notes**: do not raise the `nuxt` or `vite` ranges or pins (`packages/logging-ui`, `packages/nuxt-tools`, the Vue packages) past 4.4.x / 7.x, or the consumer gets a second Nuxt or Vite. nzyme's own share of the migration is known: nuxt 4.6 types the nitro hooks again, so the `@ts-expect-error nitro hooks are not typed` directive in `packages/nuxt-tools/src/outputFilesModule.ts` becomes an error (TS2578) and must go; `crossws` moves to the 0.4.x line with it (General Rules). The old blocker (`@nuxt/image` pinning a beta `ipx`) is gone.

### rollup 4.62.3 through 4.67.4 (re-checked 2026-11-03)

- **Problem**: `packages/pulumi/src/compileFunction.worker.ts` stops compiling — the
  `bundleStats()` plugin no longer satisfies `InputPluginOption`.
- **Error**: `TS2322`, bottoming out at `SourceMap.file`: rollup made it `string | undefined`, while
  the copy vendored in `rollup-plugin-stats` still declares `string`.
- **Status**: blocked-by-rollup-plugin-bundle-stats
- **Notes**: 4.62.2 is the last good version — 4.62.3, 4.62.4 and 4.63.3 all fail identically, and
  nothing from 4.63.4 up to 4.67.4 was attempted, because the vendored type is unchanged:
  `rollup-plugin-bundle-stats` hard-pins `rollup-plugin-stats@2.1.3`, whose `dist/types.d.mts` still
  declares `file: string`, in 4.23.1 (published 2026-11-02) as in 4.22.3. Moving to the newest
  `rollup-plugin-stats` would not help: 3.0.2 declares `file: string` too. Re-test rollup only when a
  release relaxes `SourceMap.file`. Verify with
  `grep -n 'file' node_modules/.bun/rollup-plugin-stats@*/node_modules/rollup-plugin-stats/dist/types.d.*`.

### rollup-plugin-bundle-stats 4.23.1 (not attempted, 2026-11-02)

- **Problem**: it adds optional peers `rollup: ^4.66.0` and `vite: ^8.3.5`, both past this repository's
  walls (rollup 4.62.2, vite 7.x), and fixes nothing here: the pin on `rollup-plugin-stats@2.1.3` is
  unchanged.
- **Status**: skip — blocked-by-rollup and blocked-by-consumer (the two entries above).
- **Notes**: stay on 4.22.3 until rollup and vite can both meet the peers. `^4.22.3` lets a consumer's
  lockfile take 4.23.1 on its own; the peers are optional, so that only warns.

### @babel/core 8.1.0 (attempted 2026-11-02, reverted)

- **Problem**: `@babel/preset-env` has no 8.1.0 (`latest` is 8.0.7), so moving `@babel/core` alone
  installs a second Babel 8 tree: `@babel/types` 8.0.6 beside 8.1.0, nested `@babel/*` lockfile keys
  149 → 200. Tests stay green with that tree.
- **Status**: skip — retry once `@babel/preset-env` publishes 8.1.x.
- **Notes**: do not collapse the tree by deleting lockfile entries (General Rules → moving a locked
  version).

### vue-tsc 3.3.14 and unist-util-visit 5.2.0 (attempted 2026-11-03, reverted)

- **Problem**: both patches stay green but install a second copy of a transitive dependency.
  `vue-tsc` moves `@volar/*` to 2.4.30 and leaves `unplugin-dts` on a nested 2.4.28.
  `unist-util-visit` moves `unist-util-visit-parents` to 6.1.0 and leaves `mdast-util-directive` and
  `mdast-util-find-and-replace` on a nested 6.0.2.
- **Status**: skip — nothing here needs either patch.
- **Notes**: retry `vue-tsc` when `unplugin-dts` moves its `@volar/*`, and `unist-util-visit` when a
  later install no longer nests. Check with the lockfile key count before and after.

### typescript 7.x — the target is 7.1, not 7.0 (upstream checked 2026-10-26)

**7.0 was never going to unblock this, by design.** It ships no programmatic API. From
[Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0):

> While TypeScript 7.0 is here, it does not ship with an API. We expect TypeScript 7.1 to ship with a
> new (and different) API, but until then we have made it a priority to ensure TypeScript can be run
> side-by-side with TypeScript 6.0 for utilities that still need some programmatic access to the
> compiler (such as typescript-eslint).

Stop re-checking `typescript@7.0.x`; the question is only ever about 7.1 (`typescript@7.1.0-beta` is
published, nightlies daily). Both blocking tools are building against it in the open:

- **typescript-eslint** — [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940),
  implemented in [PR #12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803): an
  opt-in `projectService: { EXPERIMENTAL_backend: 'native' }` that talks to the TS 7.1 native parser
  over IPC. Do not expect the headline 10x — the maintainer measures roughly parity with TS6, because
  ESLint has no API for batch type queries
  ([#11677](https://github.com/typescript-eslint/typescript-eslint/issues/11677)).
- **vue-tsc / Volar** — [#5381](https://github.com/vuejs/language-tools/issues/5381) is closed as
  completed, and that is misleading: it moved only Volar's own build onto TS7. "All published packages
  (`vue-tsc`, the language server, the tsserver plugin) still require the TypeScript 6 JS API". Real
  integration waits on 7.1 content mappers, in
  [PR #6170](https://github.com/vuejs/language-tools/pull/6170) (draft). Once they land, `tsc` checks
  `.vue` directly and `vue-tsc` gets deprecated.

**A peer range will not warn you.** `vue-tsc@3.3.13` peers `typescript: >=5.0.0` with no upper bound,
so under TS7 it installs cleanly and fails at runtime through `@volar/typescript`, which consumes the
classic API. typescript-eslint states it honestly: `typescript-estree@8.72.0` peers
`typescript: >=4.8.4 <6.1.0`.

**Status**: skip — blocked-by-typescript-eslint + vue-tsc, both pending TS 7.1.

**Re-check — three conditions, all required:**

1. `npm view typescript dist-tags` → `latest` on a 7.1.x.
2. typescript-eslint PR #12803 merged **and** released.
3. Volar PR #6170 out of draft **and** released in a `vue-tsc` that drops the classic-API requirement.

`@typescript/native-preview` is frozen meanwhile (`docs/dependency-health.md`) — expected, it is being
superseded on schedule by this path.

### typescript 7.0.2 (coexistence with TS6 attempted 2026-07-20, reverted)

- **Problem**: moving the native build off `@typescript/native-preview` onto the official
  `typescript@7`, with the Vue toolchain kept on `typescript@6`, breaks lint.
- **Error**: `@typescript-eslint/typescript-estree` (a transitive dependency of `packages/eslint`)
  resolves the hoisted `typescript`; with TS7 hoisted it reads the version stub and every lint task
  dies with `TypeError: Cannot read properties of undefined (reading 'Cjs')` at
  `create-program/shared.js`. Bun's `overrides` are global, so `typescript@6` cannot be scoped to that
  one transitive dependency.
- **Status**: skip — superseded by the 7.1 entry above.
- **Notes**: what worked: native TS7 `tsc --build` type-checks the graph clean, and `vue-tsc` (TS6)
  consumes the TS7-emitted `.d.ts`. The only workaround — TS7 under an npm alias invoked by path —
  just recreates the separate-binary setup `tsgo` already gives.

### vitest 5.0.3 / 5.0.5 (attempted 2026-10-05 at 5.0.3, reverted)

- **Problem**: vitest 5 changed `toHaveTextContent(string)` from substring to exact matching. A
  consumer whose browser-mode component tests assert a prefix of an element's text fails on it.
- **Error**: the consumer's tests report `Matcher did not succeed in time` or
  `Expected element to have text content: "<prefix>"` / `Received: "<full text>"`; typecheck, unit
  tests and builds stay green.
- **Status**: blocked-by-consumer
- **Notes**: do not raise the `vitest` ranges to `^5`. The nzyme side is understood and small: vitest
  5 retypes `Assertion<T = any>` as `Assertion<R extends void | Promise<void> = void, T = unknown>`,
  so the declaration merge in `packages/vitest/src/index.ts` must repeat that parameter list and
  return `R` instead of `void` (General Rules → vitest). vitest 5 peers `vite: ^6.4 || ^7 || ^8`, so
  vite 7 does not block it.
