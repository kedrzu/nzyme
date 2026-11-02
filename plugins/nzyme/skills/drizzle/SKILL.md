---
name: drizzle
description: >-
    SQL with Drizzle ORM on Postgres, independent of the hosting platform — select-and-join queries
    only (never the relational query API `db.query.*`), single-row reads, ownership in the same WHERE,
    transactions with `afterCommit` and external calls kept outside them, batched writes, diff-based
    child updates, guarded state transitions, optimistic locking, null-safe comparison with
    `eqOrNull`, foreign keys, typed operators over raw SQL, and schema-first migrations. Use when
    writing or reviewing Drizzle queries, schema or transactions, or when setting up the database
    helpers a repo must provide. Not for: injecting the client (ioc skill) or integration-test wiring
    (testing skill).
disable-model-invocation: true
---

# Drizzle

The Drizzle schema in TypeScript is the source of truth for the database; queries are written as
SQL-shaped builder chains (`select … from … join … where`) against it. The rules below hold on any
Postgres host (Supabase, Neon, RDS, a local container). Examples name the schema namespace `schema`
(`import * as schema from './schema.js'`) and the injected client `database`.

## When NOT to use

- **Wiring the client** → `nzyme:ioc`. The Drizzle instance is a `defineService` (`DatabaseClient`)
  that units take through `deps`; never import a module-level instance.
- **Integration tests against a real database** → `nzyme:testing` (`createTestContainer`, unique
  data per test).
- **Reads the browser makes directly** (e.g. supabase-js under row-level security) — that client is
  not Drizzle; this skill covers server-side access only.

## The query API: selects and joins only

**Never use the relational query API (`database.query.<table>.findMany/findFirst`, `with: {…}`).**
In our experience it does not work well: write every read as `select` with explicit columns,
`from`, `leftJoin`/`innerJoin` and `where`. One style keeps every query readable as the SQL it
emits, composable with the same operators, and tunable in one place.

Enforce it structurally: create the client **without** the `schema` option
(`drizzle(postgresClient)`), so `database.query` has no tables and a stray `findMany` does not
compile.

```ts
const rows = await database
    .select({
        orderId: schema.order.id,
        status: schema.order.status,
        customerName: schema.customer.name,
    })
    .from(schema.order)
    .innerJoin(schema.customer, eq(schema.customer.id, schema.order.customerId))
    .where(and(eq(schema.order.accountId, accountId), isNull(schema.order.deletedAt)))
    .orderBy(desc(schema.order.createdAt))
    .limit(50);
```

One-to-many data (an order with its lines) is two selects — parent rows, then children with
`inArray(child.parentId, ids)` — grouped in TypeScript, not a nested `with`.

## Core rules

**Single row — destructure and `.limit(1)`.** Without the limit Postgres scans for more matches
and the code silently takes the first of several.

```ts
const [order] = await database.select({ … }).from(schema.order).where(…).limit(1);
if (!order) {
    return null;
}
```

**Ownership in the same WHERE as the ID.** When a query serves a request on behalf of a user,
filter by the entity ID **and** the caller's ownership column in one `where`. Fetching by ID and
checking ownership afterwards answers "not found" and "not yours" differently, which lets a caller
enumerate valid IDs, and opens a check-then-use window. Ownership through a parent table is a join
in the same query. A system-internal call whose ID comes from a trusted source (webhook, job,
another command) filters by ID alone.

```ts
.where(and(eq(schema.order.id, params.orderId), eq(schema.order.customerId, params.customerId)))
```

**Null-safe equality — `eqOrNull`.** `eq(column, value)` with `value === null` renders `= NULL`,
which matches no row, so the query silently returns nothing. When the compared value may be null,
use the repo's `eqOrNull` (emits `IS NULL` for a nullish value, `=` otherwise). When the intent is
"must be null" regardless of input, write `isNull(column)` explicitly.

**Typed operators over raw SQL.** `count()`, `max()`, `eq()`, `and()`, `isNotNull()`, `gte()`,
`inArray()` are type-checked and follow column renames; a `sql` template with hand-typed column
names is not. Raw `sql` is for what Drizzle does not model (`DISTINCT ON`, window functions,
LATERAL, row-wise comparison), and even then interpolates schema references, never string names —
`references/query-patterns.md`.

**Bounded, narrow reads.** Every list query has a `.limit()`; an unbounded select grows with
production data. Select named columns, not `.select()` on a wide table. Independent queries run
together with `Promise.all`.

## Transactions

A repo provides transaction helpers (contract in `references/transactions.md`):

|Situation|Helper|
|-|-|
|Default: inserts, simple writes|read-committed transaction|
|Read-modify-write: balance checks, versioned updates, check-then-insert that a race would duplicate|serializable transaction, retried on SQLSTATE 40001|
|A command other commands call inside their own transaction|`runInTransaction(params.tx ?? database, fn)` — joins the caller's transaction|

Two rules carry most of the weight:

- **Side effects go in `tx.afterCommit(fn)`.** Emails, queue messages, cache invalidation and
  webhooks run only after a successful commit. Inside the body they hold row locks for a network
  round trip and cannot be taken back when the transaction rolls back. A failing callback does not
  roll back the committed data, so every callback is safe to run twice or catches and logs its own
  failure.
- **External calls whose result feeds the write run outside any transaction.** Read, call the API,
  then write the result in its own statement or transaction — and make the API call idempotent
  (search before create, read before update), because "API succeeded, write failed" will happen.

A transaction body may run more than once (serialization retry), so it touches only the database
and never mutates state outside its callback.

## Writes

|Shape|Do|Why|
|-|-|-|
|Many rows to insert|one `insert().values([...])`|one round trip instead of N|
|Delete/update over a set of keys|one statement with `inArray(...)`|same|
|Update many rows to different values|one `UPDATE … FROM (VALUES …)` via a values-subquery helper|a per-row loop multiplies latency and lock time|
|Replace a set of child rows (tags, translations, assignments)|diff current vs new; delete removed, insert added, update changed|delete-all-then-reinsert churns rows, fires cascades and triggers for unchanged data|
|Move an entity through a one-way lifecycle|put the current-state precondition in the `where`, `.returning()`, zero rows → error|without the guard a retried or concurrent call re-transitions an already-moved row|
|Read-modify-write of a versioned entity|serializable transaction, or a `version` column checked in the `where`|two writers cannot both apply on the same read|

Code for each: `references/query-patterns.md`.

## Schema

- **`.references()` on every column that holds another table's ID**, self-references included. A
  bare ID column skips the foreign key and lets orphaned rows in. For a self-reference inside the
  same `pgTable`, annotate the callback `(): AnyPgColumn => table.id` to break the circular type
  inference.
- **Don't store what can be derived or fetched on demand** — stored copies must be kept in sync
  forever. Exception: a value whose derivation needs a multi-join fallback chain is denormalised
  into a column filled on write.
- **JSDoc every entity and every non-obvious column**, status values above all: what each value
  means and its gotchas.
- **Soft-deletable entities** carry `isNull(table.deletedAt)` in every query — lists, get-by-ID,
  updates, existence checks. Missing it once resurfaces deleted rows in that one path.

## Migrations

The schema is the source of truth; SQL is generated from it, never hand-edited to diverge.

|Command|What it does|Fits|
|-|-|-|
|`drizzle-kit generate`|writes versioned SQL migration files from the schema diff, committed and replayed in every environment|any database with production data; hand-written SQL files alongside for what Drizzle cannot express (row-level security policies, grants, triggers)|
|`drizzle-kit push`|applies the schema diff straight to a database, no files|local development and a pre-production repo|

`push` cannot answer drizzle-kit's rename-or-recreate prompt in a non-interactive shell (`--force`
does not answer it), so a column or table rename needs an explicit migration step. Never drop and
recreate a local schema that holds seeded data.

## Helpers a repo provides

nzyme ships no database package; the repo's database package owns these, each with the contract
described in the references:

- `DatabaseClient` service wrapping `drizzle(postgresClient)` — no `schema` option, optional query
  logging behind a local-only flag;
- transaction helpers with `afterCommit` and the 40001 retry, plus `runInTransaction` —
  `references/transactions.md`;
- `eqOrNull` and a values-subquery builder for multi-row updates — `references/query-patterns.md`.

## Anti-patterns

|Bad shape|Concrete failure|
|-|-|
|`database.query.x.findMany({ with: … })`|relational query API — banned; write `select` + joins|
|Fetch by ID, then `if (row.ownerId !== userId)`|"not found" and "not yours" differ → ID enumeration, check-then-use window|
|Single-row read without `.limit(1)`|scans for more matches; silently picks one of several|
|`eq(column, maybeNull)`|renders `= NULL`, matches nothing, returns empty without error|
|Email, HTTP call or queue send inside a transaction body|holds locks over the network; already sent when the transaction rolls back|
|Mutating outer variables inside a transaction body|doubled on a serialization retry|
|Loop of single-row inserts, updates or deletes|N round trips and a long-held transaction|
|Delete-all-then-reinsert of child rows|churn, cascades and triggers on unchanged rows|
|`where(eq(table.id, id))` alone on a status transition|re-transitions an already-moved row on retry or race|
|ID column without `.references()`|no foreign key; orphaned rows accepted|
|`sql` template with hand-typed column names|not type-checked; breaks silently on rename|
|Unbounded list query|grows with production data until it times out|

## References

- `references/transactions.md` — read when choosing an isolation level, registering `afterCommit`,
  sequencing a write around an external API call, making a command composable in a caller's
  transaction, or implementing the transaction helpers.
- `references/query-patterns.md` — read when batching writes, updating many rows to different
  values, diffing child records, guarding a state transition, adding optimistic locking, writing
  joins, aliases or unavoidable raw SQL, or implementing `eqOrNull` and the values-subquery builder.
