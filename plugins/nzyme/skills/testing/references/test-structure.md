# Test structure — coverage and value

Read when deciding what a test should assert, not just whether to write one.

The worst failure mode, made concrete: a test whose assertion **cannot fail for the bug it names**. A
test titled "excludes archived items" whose only assertion is `expect(result.length).toBeGreaterThan(0)`
passes even when archived items leak straight through. It looks like coverage and proves almost
nothing. Every rule below exists to avoid shipping a test like that.

## Don't test only schema parsing

Asserting that a schema accepts valid input and rejects invalid input re-tests the validation library.
Test your own derivations, defaults and branching.

- Bad: parse a fixture through the schema and assert the round-trip.
- Good: assert that `createDefaultSettings()` seeds exactly the expected entries.

## Cover both branches of a `&&`/`||` guard

When a path is gated by a compound condition, a regression that flips the operator or drops one side
must fail a test. One test per branch — including "both truthy" for an `&&` guard.

- Bad: only "empty text + attachments → placeholder" is tested; flipping `&&` to `||` still passes.
- Good: also "text + attachments → text wins", which fails the flipped variant.

## Don't wrap a unique-id generator in a counter

An id generator that is already unique (UUIDs, snowflake ids) needs no incrementing counter to
"guarantee" uniqueness — that is noise. Call the generator directly.

## Assert identity, not array position

Reaching into recorded calls by position (`calls[0]`, `events[events.length - 1]`) couples the test to
the implementation's internal ordering: change how many calls happen, or their order, and the test
breaks for an unrelated reason — or silently reads the wrong entry. Find the entry by a property that
identifies it, unless order is itself the documented contract.

- Bad: `const retry = scheduled[scheduled.length - 1]!;` — assumes the retry is always scheduled last.
- Good: `const retry = scheduled.find(job => job.type === 'retry');`

## Assert the exact value, not an inequality

For a function with an exact result, `toBeGreaterThan(0)` or `toBeTruthy()` passes for any non-zero
output, including a wrong formula (sample instead of population variance, an off-by-one denominator).
Assert the closed-form value with `toBeCloseTo(expected, digits)`; prefer an exact expression
(`Math.sqrt(1 / 600)`) over a magic decimal.

- Bad: `expect(result.std).toBeGreaterThan(0)` — a `÷(N−1)` bug still passes.
- Good: `expect(result.std).toBeCloseTo(Math.sqrt(1 / 600), 10)`.

The same applies to any deterministic value: `toBeDefined()` on a known parsed field proves the parser
returned *something*, not the right thing. `toBeDefined()` is fine only as a guard right before a
concrete assertion — `expect(row).toBeDefined(); expect(row!.ownerId).toBe(ownerId);`.

## Assert the payload, not that a call happened

Mocking a unit's real output boundary (a sender, a publisher, an API client) is defensible — then
assert **what** it received. A bare `toHaveBeenCalled()` passes when the unit builds the wrong payload.

```ts
const expected: Partial<OrderShippedEvent> = { orderId, carrier: 'DHL', itemCount: 2 };
expect(publish).toHaveBeenCalledWith(expect.objectContaining(expected));
```

For a state-machine contract, assert the count with intent: `toHaveBeenCalledTimes(1)` after three
`tick()` calls proves "doesn't re-publish on repeated ticks".

## Errors: `rejects`, not `try/catch`

`try { await call(); expect(true).toBe(false); } catch (e) { expect(e).toBeDefined(); … }` is noisy and
only half-guards. Use the idiomatic assertion, which fails correctly when nothing throws:

```ts
await expect(call()).rejects.toMatchObject({ status: 400 });
```
