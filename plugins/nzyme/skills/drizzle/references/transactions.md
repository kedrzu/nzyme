# Transactions — isolation levels, afterCommit, external calls, composable commands

## The helpers a repo provides

The repo's database package exports one entry point per isolation level plus a composer. Each takes
`(database, async tx => { … })` and returns the callback's result; `tx` is a Drizzle transaction
extended with `afterCommit(fn)`.

|Helper|Postgres level|Use when|
|-|-|-|
|`transactionReadCommitted`|read committed|**Default.** Inserts, simple writes, event appends — most commands|
|`transactionSerializable`|serializable|Read-modify-write: balance or quota checks, versioned updates, state machines, check-then-insert where a race would duplicate|
|`transactionRepeatableRead`|repeatable read|Several reads that must see one snapshot (reports). Rare — prefer the other two|
|`runInTransaction(db \| tx, fn)`|caller's, or read committed|A command other commands call and that must join their transaction|

Under concurrent load a serializable (or repeatable-read) transaction can be **aborted** with a
serialization failure, SQLSTATE `40001`, instead of blocking. Postgres documents that such a
transaction may succeed if retried, so the helper retries the whole body a few times with backoff.

### Contract

1. **The body may run more than once.** It touches only the database and never mutates variables,
   arrays, caches or counters declared outside the callback — they would compound on a retry.
   Reading an outer `const` is fine.
2. **`afterCommit` callbacks are collected per attempt** and run sequentially, in registration
   order, once, after the final successful commit. Callbacks registered by an aborted or retried
   attempt never run.
3. **Callbacks run outside the retry loop.** A callback that throws — even with a 40001-shaped
   error — never replays the committed body. Remaining callbacks are skipped and the helper call
   rejects, so the caller sees an error for work that is committed.
4. **`runInTransaction` given a transaction runs the callback directly in it** — no savepoint. An
   error aborts the caller's transaction, and `afterCommit` callbacks registered inside fire when
   the outermost transaction commits. Given a client, it opens a read-committed transaction.

### Reference implementation shape

Driver-specific parts are marked; with `postgres-js` the error class is `postgres.PostgresError`,
with `node-postgres` it is `DatabaseError` from `pg`.

```ts
import { PgTransaction } from 'drizzle-orm/pg-core';
import type { PgDatabase, PgTransactionConfig } from 'drizzle-orm/pg-core';

export type DatabaseTransaction =
    DatabaseClient extends PgDatabase<infer TQueryResult, infer TFullSchema, infer TSchema>
        ? PgTransaction<TQueryResult, TFullSchema, TSchema> & {
              afterCommit(fn: () => unknown): void;
          }
        : never;

type IsolationLevel = PgTransactionConfig['isolationLevel'];
type TransactionBody<T> = (tx: DatabaseTransaction) => Promise<T>;

export function transactionReadCommitted<T>(db: DatabaseClient, fn: TransactionBody<T>) {
    return executeTransaction(db, 'read committed', fn);
}

export function transactionSerializable<T>(db: DatabaseClient, fn: TransactionBody<T>) {
    return executeTransaction(db, 'serializable', fn);
}

export function runInTransaction<T>(db: DatabaseClient | DatabaseTransaction, fn: TransactionBody<T>) {
    if (db instanceof PgTransaction) {
        return fn(db);
    }
    return executeTransaction(db, 'read committed', fn);
}

async function executeTransaction<T>(db: DatabaseClient, isolationLevel: IsolationLevel, fn: TransactionBody<T>) {
    const maxRetries = 3;
    let retries = 0;
    let callbacks: (() => unknown)[] = [];
    let result: T;

    for (;;) {
        // Fresh list per attempt: an aborted attempt's callbacks must never run.
        const attemptCallbacks: (() => unknown)[] = [];
        try {
            result = await db.transaction(
                tx => {
                    const scope = tx as DatabaseTransaction;
                    scope.afterCommit = cb => attemptCallbacks.push(cb);
                    return fn(scope);
                },
                { isolationLevel },
            );
            callbacks = attemptCallbacks;
            break;
        } catch (error) {
            if (!isSerializationFailure(error) || retries >= maxRetries) {
                throw error;
            }
            await waitFor(2 ** retries);
            retries++;
        }
    }

    // Outside the retry loop: a failing callback never replays the committed body.
    for (const cb of callbacks) {
        await cb();
    }

    return result;
}

function isSerializationFailure(error: unknown): boolean {
    // Drizzle wraps query errors (the driver error is the `cause`); a commit-time abort arrives
    // unwrapped — walk the chain.
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof DriverError && current.code === '40001') {
            // driver-specific class
            return true;
        }
    }
    return false;
}
```

The `as DatabaseTransaction` is the one place the extension is attached; keep it there. Cover the
helper with integration tests for: callbacks run after commit, an aborted attempt's callbacks do
not run, a throwing callback does not replay the body, a 40001 is retried.

## afterCommit

```ts
return await transactionReadCommitted(database, async tx => {
    const [account] = await tx.insert(schema.account).values(values).returning({ id: schema.account.id });
    tx.afterCommit(() => sendWelcomeEmail({ accountId: account.id }));
    return account;
});
```

Why it exists: an external call inside the body holds row locks for a network round trip, and when
the transaction later rolls back the call cannot be un-sent.

What the contract demands of every callback:

- **Safe to run twice.** The caller sees a rejection for committed work and may retry the whole
  command; the database work must absorb the retry (check-then-insert, below) and the side effect
  must tolerate a second call for the same committed state.
- **Non-critical effects catch and log their own failure** so they neither fail the command nor
  starve the callbacks after them (how to log a caught error: `nzyme:logging`).
- **Never put a must-happen state change in `afterCommit`.** If losing the effect breaks the system
  (money bookkeeping, an entitlement), it is a row written inside the transaction — and a job or
  outbox processes it from there.

## Idempotent check-then-insert

A retry of the whole command must find the row the first attempt created, not duplicate it. Check
and insert in one transaction — serializable when two concurrent requests could both pass the check,
or rely on a unique constraint with `onConflictDoNothing()`.

```ts
return await transactionSerializable(database, async tx => {
    const [existing] = await tx
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(and(eq(schema.member.email, params.email), isNull(schema.member.deletedAt)))
        .limit(1);

    if (existing) {
        return { error: 'ALREADY_EXISTS' } as const;
    }

    const [member] = await tx.insert(schema.member).values(values).returning({ id: schema.member.id });
    tx.afterCommit(() => memberSync({ memberId: member.id }));
    return { memberId: member.id };
});
```

## External calls whose result feeds the write

When the write needs the external call's result (persisting a payment provider's product ID after
creating it), the side effect cannot be deferred to `afterCommit`. The sequence:

1. Read what you need — the common case may already have the answer and need no external call.
2. Call the external API outside any transaction.
3. Write the result in its own statement or transaction.

"API succeeded, local write failed" will happen, so the external call carries its own idempotency:
before creating, search for an existing resource (by metadata or a unique key); before updating,
read the external state and change only what differs. Never blind-create.

```ts
async function ensureProviderProduct(productId: string): Promise<string> {
    const [current] = await database
        .select({ providerId: schema.product.providerId })
        .from(schema.product)
        .where(eq(schema.product.id, productId))
        .limit(1);

    if (current?.providerId) {
        return current.providerId;
    }

    // Covers "created at the provider, local write failed" from an earlier run:
    const existing = await providerSearchProduct({ productId });
    if (existing) {
        return existing.id;
    }

    return (await providerCreateProduct({ productId })).id;
    // The caller writes providerId back with a plain update.
}
```

**Prefer event-driven sync when the external system calls back.** When asking an external system
to change state that it reports through a webhook, don't also write the local state in the same
flow. Let the webhook drive an idempotent sync command: the external event is the source of truth
for "did this happen", and replaying it re-runs the same sync.

## runInTransaction — composable commands

A command that other commands call takes an optional `tx` and wraps its work:

```ts
return await runInTransaction(params.tx ?? database, async tx => {
    // the whole body uses tx
});
```

The caller passes its `tx` to make both commands one atomic unit. Because there is no savepoint, an
error inside aborts the caller's transaction too — the callee never catches and continues after a
failed statement.
