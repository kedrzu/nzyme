# CloudFront Functions compile against an explicit runtime model, not a Node target

> Recorded in the consuming healed monorepo, where nzyme is a git submodule, and moved here because the decision is about nzyme. Mentions of Healed describe the consumer the decision was made for.

## Status

Accepted

## Context

CloudFront Functions run on `cloudfront-js-2.0`, which is ECMAScript 5.1 plus an enumerated menu
of later features — not a browser, not Node. The patient app's viewer-request function is bundled
from shared code (`packages/lambdas/src/patientViewerRequest.ts` pulls in
`parseAcceptLanguageHeader` from `@healed/common`), and the compiler
(`packages/pulumi/src/compileFunction.worker.ts`) ran `@babel/preset-env` with
`targets: { node: '5' }` and no `useBuiltIns`. That target is wrong in both directions: it
downlevels syntax the runtime has (`const`/`let`, arrow functions, template literals), costing
bytes against a hard 10 KB quota, and it never touches built-in methods, so an ES2023 call passes
typecheck, lint, build and deploy and fails only at the edge.

That is exactly what happened during the `testing` cutover verification (HLD-381):
`Array.prototype.toSorted` in `parseAcceptLanguageHeader` — added by an `unicorn/no-array-sort`
lint suggestion in PR #273 — made every browser request to the patient app root a CloudFront 503
("The CloudFront function associated with the CloudFront distribution is invalid or could not
run"). `curl` without an `Accept-Language` header took the early return and got the 302, so no
health check saw it.

> **Checked 2026-09-04:** the runtime is documented as "compliant with ECMAScript (ES) version 5.1
> and also supports some features of ES versions 6 through 12", followed by a method-by-method
> allowlist — [AWS, JavaScript runtime 2.0 features](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html).
> Maximum function size is 10 KB and the quota is not adjustable —
> [AWS, CloudFront quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html).

> **Measured 2026-09-04** with `aws cloudfront test-function` on a throwaway function in the
> `testing` account (deleted afterwards): the runtime also has `Array.from` and a `global` object,
> neither of which the document lists; every deployed function starts with `global.handler =`.
> Absent, as documented: `Array.prototype.{flat,flatMap,at,findLast,findLastIndex,toSorted,
> toReversed,toSpliced,with}`, `String.prototype.{at,matchAll,normalize}`,
> `Object.{fromEntries,hasOwn,groupBy}`, `Map`, `Set`, `WeakMap`, `Proxy`, `Reflect`, `BigInt`,
> `Intl`, `URL`, `structuredClone`.

> **Measured 2026-09-04:** Babel 8's own downlevel helpers reference `Array.from`, `Array.isArray`,
> `Symbol.iterator`, `Object.getOwnPropertySymbols`, `Symbol.toPrimitive` (for `for…of`, spread,
> destructuring, object spread, classes) and `Reflect.construct` (for `class extends`). A guard
> built from the document alone would reject every function that works today.

No ready-made Babel preset for CloudFront Functions exists (searched 2026-09-04), and
`@babel/preset-env` cannot express this target: no browserslist entry means "ES 5.1 plus these
forty methods".

## Decision

**`compileFunction` takes `target: 'cloudfront'` instead of a Node version for CloudFront
Functions**, and that target is a preset of our own in `@nzyme/pulumi`
(`packages/pulumi/src/cloudfront/`), with one runtime model and three consumers:

1. **The runtime model** (`cloudFrontRuntime.ts`) is the union of the AWS document, the measured
   extras (`global`, `Array.from`) and the identifiers Babel's helpers emit. Every entry carries its
   provenance (`doc` / `probe` / `helper`) and the document carries its read date. `Reflect` is
   deliberately absent, so `class extends` fails the check instead of failing at the edge.
2. **The preset** (`cloudFrontFunctionPreset.ts`) is `@babel/preset-env` at an ES5 target with the
   transforms for syntax the runtime already has excluded — arrow functions, template literals,
   block scoping, exponentiation, `async`/`await`, sticky regex, named groups, numeric separators,
   `typeof Symbol` — plus a plugin (`cloudFrontMethodsPlugin.ts`) that rewrites the sugar methods the
   runtime lacks (`toSorted`, `toReversed`, `toSpliced`, `with`, `at`, `flat`, `flatMap`,
   `findLast`, `findLastIndex`, `Object.fromEntries`, `Object.hasOwn`) into ES5 helpers guarded by
   `Array.isArray`, falling back to the original call for anything that is not an array.
3. **The check** (`assertCloudFrontFunctionCode.ts`) runs on the **final** bundle — after Babel and
   after terser, as a Rollup `renderChunk` plugin — and on the two hand-written templates that never
   go through the compiler (`createRewriteCloudfrontFunction`, `createSentryTunnel`). It is
   scope-aware (`@babel/core` `parseSync` + `traverse`): a free identifier outside the model, a call
   to a static or instance method outside the model, a generator or `for await`, or a bundle over
   10 240 bytes stops the compile with the API name, the source file and a suggested replacement.
   String literals never trip it — `"Map"` inside a Babel helper is not a `Map`.

A repo-side test (`packages/infra/src/utils/createCloudFrontFunction.test.ts`) discovers every
`createCloudFrontFunction` call site in the stack sources and compiles each entry point through the
same path, so the guard also runs in `bun tests`, not only at deploy time.

Shared utilities keep using modern array methods. `parseAcceptLanguageHeader` keeps its
`toSorted`; the preset rewrites it for the edge, which is the point of having a preset rather than a
rule in `packages/common` that only one consumer needs.

## Consequences

- A method the runtime lacks is either rewritten (sugar) or a build failure with a named cause —
  never a 503 discovered in a browser.
- The five deployed functions shrank or stayed within a few bytes (patient viewer-request
  5 002 → 4 826 B); `const`, arrow functions and template literals now survive into the bundle.
- The runtime model is a dated snapshot. When AWS ships a new runtime or adds a method, the model
  file is where it changes, and the probe procedure (a temporary function plus
  `aws cloudfront test-function`) is how the change is checked before it is written down.
- Known limits of the check: it does not reject `for…of`, spread, optional chaining or `class` in
  a hand-written template (the compiler downlevels them in bundled code, so only templates could
  carry them), and `async` closures passed as arguments — which the runtime does not support — are
  not detected. Neither occurs in any current function.
- A method named like one of the rewritten ones on a non-array object (`.at()`, `.with()`) takes the
  helper's fallback and behaves as before; a call spelled directly on such an object still fails the
  final-bundle check, and the remedy is renaming the method, not an escape hatch.
