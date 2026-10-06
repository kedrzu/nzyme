---
name: testing
description: >-
    Deciding whether a test is worth writing and writing it well in projects built on @nzyme — the
    test-worthiness gate, the anti-signal catalog of tests that look like coverage but prove nothing,
    bun:test conventions, wiring units with createTestContainer from @nzyme/ioc-testing and container.set
    overrides, captured logs, assertion typing, and the @nzyme/vitest matchers. Use when writing,
    reviewing or debugging a unit or integration test (`*.test.ts`) for code that uses @nzyme/ioc or
    other @nzyme packages, or when deciding whether a change needs a test at all.
---

# Testing

## Is this test worth writing?

A test earns its place only if it would catch a real future regression that the type system and
higher-level tests don't already catch. Low-value tests dilute the signal of a failing suite and make
every refactor drag a tail of brittle assertions — prefer **fewer, higher-value tests**. Name the
realistic production change the test would catch, and ask:

> If I deleted this test, what real bug could now ship that nothing else would catch?

If the honest answer is "none" or "only a refactor I'd notice anyway", don't write it — and don't demand
it in review.

**Anti-signal catalog** — each looks like coverage but proves little (worked examples in
`references/test-structure.md`):

- **Assertion too weak to catch the named bug** — `toBeGreaterThan(0)`, `toBeTruthy()`, `toBeDefined()`
  standing in for the expected value. A test titled "excludes archived items" that asserts only
  `expect(result.length).toBeGreaterThan(0)` passes when archived items leak straight through.
- **Existence-only on deterministic data** — `toBeDefined()` on a known parsed field. It is fine only as
  a guard *immediately before* a concrete assertion.
- **Call-not-payload** — bare `toHaveBeenCalled()` when the payload is the contract; assert
  `toHaveBeenCalledWith(expect.objectContaining({...}))`.
- **Input echo** — `expect(result.foo).toBe(input.foo)` when the unit passes `foo` through.
- **Self-fulfilling mock** — the mock returns `X`, the test asserts `X`; passes even if the unit is
  `x => x`.
- **Type tautology** — asserting a runtime shape the compiler already guarantees.
- **Literal or declaration lock-in** — exact-string tests for labels and descriptions; assertions that
  mirror a static config object. Review of the diff protects a config value, not a test restating it.
  If the only way to test something is extracting it from its single call site into a function that
  exists for the test, don't test it.
- **"It renders"** — mounting a component without logic and asserting it rendered.
- **Non-idiomatic error test** — `try { …; expect(true).toBe(false) } catch …` → `await
  expect(call()).rejects.toMatchObject({ status: 400 })`.
- **Mock-the-world, coupled-to-internals, snapshot churn** — every collaborator stubbed (verifies the
  call graph, not behavior); asserting private helpers or call order; snapshots so coarse they get
  re-blessed blindly.
- **Duplicated coverage across layers** — the same rule proven at two levels; let each layer own what
  only it can prove.
- **Per-call-site negatives** — one test per caller for an invariant a single test at the shared
  boundary can own.

**What strong tests do:** assert **observable output** — returned values, persisted state read back, the
exact emitted payload — never an internal flag; bind **typed expected values** so the compiler guards
the fixture; prove **state transitions**; include **true negatives** so the assertion can fail.

**Worth writing:** non-trivial branching and state transitions; pure helpers whose behavior isn't obvious
from the signature; public contracts (endpoints, widely used commands); behavior depending on external
state (query shape, auth narrowing, idempotency). A red-first regression test still has to pass the gate
first.

**Not worth writing:** pass-throughs, getters, prop forwarding; what TypeScript enforces; paths upstream
validation makes unreachable; restating a higher-level test one level lower.

**Borderline calls:**

- *Exact-string test for a CLI command's description* — reject; it catches a copy edit, not a failure.
- *"Spinner shows while loading"* — worth it when the component owns the transition (its own state flips
  when its data resolves); not when it merely forwards a `loading` prop.
- *Wrapper endpoint handler (checks auth, calls a command)* — looks like a self-fulfilling mock but is
  worth writing: it proves the unauthorized path and that input reaches the command unmangled. Keep it
  to one auth assertion and one `toHaveBeenCalledWith`; asserting the mocked command's return makes it
  noise.
- *A pure `switch` over a compiler-checked union* — one representative case; the compiler already fails
  on a missing branch.

**Unit vs integration** is the IO boundary: pure logic with no deps → unit test of the function;
anything with injected deps → resolve it from `createTestContainer()` with the real collaborators. Use
the cheapest harness that catches the regression.

## bun:test conventions

- Import from `bun:test`: `import { expect, mock, test } from 'bun:test'` (`vi` exists too, for Jest-style
  code). Never mix `bun:test` and `vitest` imports in one file.
- Name files `*.test.ts`, colocated with the unit. A file the runner doesn't glob is silently never run —
  it looks green forever.
- Top-level `test()`; no `describe()` wrapper for a single group — the file name is the grouping.
- Helpers go at the **bottom** of the same test file as plain hoisted functions — not in a separate
  `.ts`, which would compile as production code. A one-line helper used once is just indirection; inline
  it.
- Run a narrow target while iterating: `bun test <file>`. `LOGGING=true` prints captured logs.

## Wiring units — `createTestContainer`

```ts
import { mock, test, expect } from 'bun:test';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

test('creates the product and returns its id', async () => {
    const { container, logs } = createTestContainer();
    const createProduct = mock(async () => ({ id: 'p1' }));
    container.set(ProductApiClient, { createProduct });
    container.set(EnvVariables, { CATALOG_API_KEY: 'test-key' });

    const result = await container.resolve(ProductCreateCommand)({ name: 'Mug', priceCents: 1200 });

    const expected: ProductCreateCommandResult = { productId: 'p1' };
    expect(result).toEqual(expected);
    expect(createProduct).toHaveBeenCalledWith({ name: 'Mug', priceCents: 1200 });
    expect(logs.some(log => log.message === 'Product created')).toBe(true);
});
```

- **Overrides go in before the first `resolve`** — singletons resolve their deps once. `set` reaches
  singleton services, commands, factories and interfaces; not the transient `Logger` or plain injectables
  (env variables, `Fetch`) — see the ioc skill.
- **Don't mock internal services and commands** — resolve the real ones; mock only the true outside
  world (third-party APIs, clocks). A mocked integration test passes while the real wiring is broken.
- **Never mock the logger** — `createTestContainer()` already captures every entry in `logs`; outside a
  container use `createTestLogger(name)` from `@nzyme/logging/createTestLogger.js`.
- **No process-wide mutation** — not `process.env` (set `EnvVariables` in the container), not module
  singletons. Restoring in `afterEach` is fragile: a mid-test throw or a parallel reader leaks it.
- **No `mock.module` at file top level** — bun shares the module cache across the whole run, so the mock
  leaks into every other test file. Prefer container overrides; if you must mock a module, run the full
  suite afterwards.
- **Collision-free input instead of cleanup** — generate unique ids per test rather than deleting data in
  `afterEach`; never assert on "everything" in shared state, only on what this test created.
- **Never gate a test on infrastructure with `test.skip`** — it silently hides the test whenever the
  infra is missing. Let it fail loudly.
- **A mock that needs a builder chain is a design signal** — when stubbing means recreating
  `client.select().from().where()`, extract the query into its own `defineCommand`; the dependency
  becomes one mockable function and the test stops depending on the query's shape.

## Vitest projects

`@nzyme/vitest` adds Vitest-only helpers: listing `@nzyme/vitest/setup` in Vitest's `setupFiles`
registers `toEqualFully` and `toEqualPartially` (an `objectContaining` per object, or per array item);
the asymmetric matchers `nullable()`, `nullish()` and `optional()` from `@nzyme/vitest` accept
`null`/`undefined` in addition to a matcher; `advanceTime(duration)` moves the faked system time forward
by a `date-fns` duration.

## References

- `references/test-structure.md` — what a test should assert: weak assertions, both branches of a
  guard, identity not position, exact values, payload not call, `rejects` for errors.
- `references/assertions.md` — assertion typing: typed `const` expectations, which matcher, typed mock
  returns, no `as never`, `!` in tests, typed `objectContaining`.
