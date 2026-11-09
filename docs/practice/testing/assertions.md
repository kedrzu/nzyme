# Assertion typing

Read before asserting on object shapes, typing a mock's return value, or writing a rejection assertion.

## Bind expected objects to a typed `const`

An inline literal passed to a shape matcher is checked against nothing, so renamed, removed or extra
fields pass silently and the test keeps asserting a stale contract while staying green.

```ts
// BAD — the typo `staus` is never caught
expect(result).toEqual({ id: '1', staus: 'active' });

// GOOD — the const is checked against the real interface
const expected: OrderSummary = { id: '1', status: 'active' };
expect(result).toEqual(expected);
```

Import the real exported interface. Never cast the expected value to an inline type
(`as { id: string }`) — that reopens the blind spot. Applies to `toEqual`, `toMatchObject` and
`toHaveBeenCalledWith`.

## Which matcher

|Matcher|Use when|
|-|-|
|`toEqual(expected)`|the value must equal the whole expected object, key for key|
|`toMatchObject(expected)`|you assert a **subset** of a larger object|
|`expect.objectContaining(expected)`|a partial match **inside** a call or nested assertion|

## Typed mock returns, not casts

A mock returning `{ score: 1 } as EvalResult` lies to the compiler: when `EvalResult` gains a required
field, the mock stays green while production breaks. Bind a typed `const`:

```ts
const evalResult: EvalResult = { score: 1, reason: 'ok' };
const evaluate = mock(async () => evalResult);
```

## Never satisfy a mock's type with `as never` / `as unknown as`

Those casts switch off the check — when the mocked interface changes, the test compiles and misses the
mismatch.

- Reuse the project's existing mock factory for a service if it has one.
- For a `Logger`, use `createTestLogger` from `@nzyme/logging/createTestLogger.js` (a real `Logger` plus
  `logs`) — never a hand-rolled no-op stub.
- Otherwise write a small typed stub implementing the interface (`function createCatalogStub(): CatalogClient
  { ... }`) — as short as the cast, but it enforces the contract. Promote it to a shared
  `createXxxMock()` once a second test file copies it.
- A scoped, justified cast is still fine — e.g. building a discriminated-union fixture where TypeScript
  genuinely can't narrow — kept to one line inside a helper.

## `!` is fine in tests

Production code prefers `assert()` from `@nzyme/utils/assert.js` over `!`, but in a test a wrong `!`
fails immediately with a clear stack. Use `!` after an `expect(x).toBeDefined()` guard or for fixture
fields the setup always populates; keep `assert()` for helpers shared across test files.

## Typed `objectContaining`

`expect.objectContaining` accepts any `object`, so an inline literal passed to it is never checked
against the real type. Bind the argument to a `Partial<T>` const:

```ts
const expectedData: Partial<OrderCreatedData> = { orderId, currency: 'EUR' };
expect(event.data).toEqual(expect.objectContaining(expectedData));
```

For nested partial matches, build one typed `Partial` const per level and nest them.

## Don't spread + cast when the target type is assignable

`{ ...json, local: true } as OrderViewModel` hides future mismatches when `OrderViewModel` grows a
required field. Try the spread without the cast — TypeScript often accepts it; when it doesn't, fix the
type or set the field explicitly.

## Use named types, not `ReturnType<...>['field']`

`createTestContainer()` returns a `Container` (`@nzyme/ioc/Container.js`) — type helper parameters with
it, not with `ReturnType<typeof createTestContainer>['container']`, which is indirect and breaks when the
helper's return shape changes.
