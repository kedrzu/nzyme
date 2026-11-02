# Package Update Notes

Last updated: 2026-11-02

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
what lets the native compiler coexist with it. Migrate to `typescript@7` in one step only once
`vue-tsc` and `typescript-eslint` ship TS7-native builds. See the Known Issues.

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

### nuxt 4.5+ / vite 8 (re-checked 2026-10-19)

- **Problem**: a consumer is held on nuxt 4.4.8 and vite 7. nuxt, vite, `@unhead/vue` and
  `@nuxt/image` move together (nuxt 4.5 requires vite 8 and unhead 3; unhead 3 requires
  `@nuxt/image` 2.x), and `@nuxt/image` 2.1.0 breaks a built Nuxt server at runtime.
- **Error**: `Cannot find package 'srvx'` from the built server's `node_modules/ipx` — `@nuxt/image`
  2.1.0 needs `ipx: 4.0.0-beta.1`, and Nitro's trace never copies its `srvx` dependency.
  `@nuxt/image` 1.11.0 does not compile against unhead 3.
- **Status**: blocked-by-consumer
- **Notes**: do not raise the `nuxt` or `vite` ranges (or the exact pins in `packages/logging-ui`
  and the Vue packages) past 4.4.x / 7.x, or the consumer gets a second Nuxt or Vite. Cheap
  re-check: `npm view @nuxt/image@latest optionalDependencies` — while it still reads
  `ipx: 4.0.0-beta.1`, the chain is still blocked. `crossws` rides this chain (General Rules).

### rollup 4.62.3 through 4.64.10 (re-checked 2026-10-19)

- **Problem**: `packages/pulumi/src/compileFunction.worker.ts` stops compiling — the
  `bundleStats()` plugin no longer satisfies `InputPluginOption`.
- **Error**: `TS2322`, bottoming out at `SourceMap.file`: rollup made it `string | undefined`, while
  the copy vendored in `rollup-plugin-stats` still declares `string`.
- **Status**: blocked-by-rollup-plugin-bundle-stats
- **Notes**: 4.62.2 is the last good version — 4.62.3, 4.62.4 and 4.63.3 all fail identically, and
  nothing from 4.63.4 up to 4.64.10 was attempted, because the vendored type is unchanged:
  `rollup-plugin-bundle-stats@4.22.3` (latest on 2026-10-19) hard-pins `rollup-plugin-stats@2.1.3`,
  whose `dist/types.d.mts` still declares `file: string`. Bump `rollup-plugin-bundle-stats` freely;
  re-test rollup only when a release relaxes `SourceMap.file`. Verify with
  `grep -n 'file' node_modules/.bun/rollup-plugin-stats@*/node_modules/rollup-plugin-stats/dist/types.d.ts`.

### typescript 7.0.2 (coexistence with TS6 attempted 2026-07-20, reverted; re-checked 2026-10-19)

- **Problem**: moving the native build off `@typescript/native-preview` onto the official
  `typescript@7`, with the Vue toolchain kept on `typescript@6`, breaks lint.
- **Error**: `@typescript-eslint/typescript-estree` (a transitive dependency of `packages/eslint`)
  resolves the hoisted `typescript`; with TS7 hoisted it reads the version stub and every lint task
  dies with `TypeError: Cannot read properties of undefined (reading 'Cjs')` at
  `create-program/shared.js`. Bun's `overrides` are global, so `typescript@6` cannot be scoped to that
  one transitive dependency.
- **Status**: skip — blocked-by-typescript-eslint (+ vue-tsc through Volar)
- **Notes**: what worked: native TS7 `tsc --build` type-checks the graph clean, and `vue-tsc` (TS6)
  consumes the TS7-emitted `.d.ts`. The only workaround — TS7 under an npm alias invoked by path — just
  recreates the separate-binary setup `tsgo` already gives. Re-check with two commands; migrate in
  one step when both clear:
  - `npm view @typescript-eslint/typescript-estree@latest peerDependencies` — read
    `typescript: >=4.8.4 <6.1.0` at 8.71.2, so TS7 (and TS 6.1) is excluded.
  - `npm view typescript@7.0.2 exports` — `"."` is `./lib/version.cjs`; the compiler API is only
    under `./unstable/*`, and `vue-tsc` reaches it through `@volar/typescript`, which uses the
    classic API.

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
