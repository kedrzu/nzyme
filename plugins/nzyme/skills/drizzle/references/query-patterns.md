# Query patterns — joins, null-safe comparison, batching, guarded and versioned updates, raw SQL

## Joins and aliases

Related data is a join, not a correlated subquery and never the relational query API. A second
join to the same table takes an `alias`:

```ts
import { alias } from 'drizzle-orm/pg-core';

const replacement = alias(schema.document, 'replacement');

const rows = await database
    .select({
        id: schema.document.id,
        title: schema.document.title,
        replacementId: replacement.id,
    })
    .from(schema.document)
    .leftJoin(replacement, eq(replacement.id, schema.document.replacedById))
    .where(eq(schema.document.workspaceId, workspaceId))
    .limit(100);
```

Ownership through a parent is a join in the same query, so "missing" and "not yours" stay
indistinguishable:

```ts
.from(schema.comment)
.innerJoin(schema.post, eq(schema.post.id, schema.comment.postId))
.where(and(eq(schema.comment.id, params.commentId), eq(schema.post.authorId, params.userId)))
```

**Simple transformations belong in TypeScript.** A fallback between two nullable fields reads
better as `row.publishedAt ?? row.createdAt` than as `COALESCE`. Keep SQL-level logic for what must
run in the database: aggregation, and filtering large sets before they leave Postgres.

**Denormalise an expensive fallback chain.** When resolving a value needs several joins (a
translation fallback across languages), add a column on the parent filled on write; reads use it,
writes update both.

## eqOrNull

```ts
import { eq, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Equality that also matches NULL: `IS NULL` for a nullish value, `=` otherwise.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function eqOrNull(column: Parameters<typeof eq>[0], value: unknown): SQL {
    if (value == null) {
        return isNull(column);
    }
    return eq(column, value);
}
```

Typical use: matching existing rows on nullable natural-key columns during a sync
(`eqOrNull(schema.item.variant, incoming.variant)`). The branch is chosen when the query is built.

## Batch writes

One statement instead of N round trips:

```ts
await tx
    .delete(schema.tag)
    .where(and(eq(schema.tag.postId, postId), inArray(schema.tag.name, removed)));

await tx.insert(schema.tag).values(added.map(name => ({ postId, name })));
```

Guard each with `if (list.length > 0)` — an empty `values([])` or `inArray(col, [])` is either an
error or a no-op you did not need a round trip for.

### Many rows, different values — `UPDATE … FROM (VALUES …)`

A values-subquery helper builds `(VALUES (…), (…)) AS v(col, …)` and exposes `v.col` as typed SQL
fragments for `set` and `where`:

```ts
const v = getValuesSubquery({
    values: items.map(i => ({ memberId: i.memberId, status: i.status, seenAt: i.seenAt.toISOString() })),
    // Casts are required for enums, jsonb and timestamps — without them Postgres sees text and the
    // UPDATE fails on a type mismatch. Enums take the pgEnum object, the rest a type name.
    types: { memberId: 'uuid', status: schema.memberStatus, seenAt: 'timestamptz' },
});

await database
    .update(schema.membership)
    .set({ status: v.columns.status, seenAt: v.columns.seenAt })
    .from(v.query)
    .where(and(eq(schema.membership.groupId, groupId), eq(schema.membership.memberId, v.columns.memberId)));
```

Helper contract and shape:

```ts
export function getValuesSubquery<T extends object>(params: {
    name?: string; // default 'v'
    values: T[];
    types?: Partial<Record<keyof T, string | PgEnum<[string, ...string[]]>>>;
}) {
    const { name = 'v', values, types } = params;
    const [first] = values;
    assert(first, 'getValuesSubquery needs at least one row'); // callers guard empty lists first

    const keys = Object.keys(first) as (keyof T & string)[];
    const columns = Object.fromEntries(keys.map(k => [k, sql.raw(`${name}.${k}`)])) as {
        [K in keyof T & string]: SQL<T[K]>;
    };
    const rows = values.map(row => sql`(${sql.join(keys.map(k => cast(row[k], types?.[k])), sql`, `)})`);
    const query = sql`(VALUES ${sql.join(rows, sql`, `)}) ${sql.raw(`AS ${name}(${keys.join(', ')})`)}`;

    return { query, columns };
}
// cast(value, type): `${value}::${type}` when a type is given (pgEnum → its enumName); otherwise
// infer from the JS value — bigint → ::bigint, integer → ::integer, other number → ::numeric,
// Date → ISO string ::timestamp, object → JSON string ::jsonb, else the bare parameter.
```

Keys become SQL identifiers through `sql.raw`, so they must come from code, never from input.

## Diff-based updates of child records

Replacing a set of children (translations, tags, assignments) by delete-all-then-reinsert churns
rows and fires cascades and triggers for unchanged data. Load the current rows, diff in TypeScript
keyed by the natural key, then delete removed, insert added and update changed — each in one
statement.

```ts
const current = await tx
    .select({ lang: schema.productName.lang, name: schema.productName.name })
    .from(schema.productName)
    .where(eq(schema.productName.productId, productId));

const currentByLang = new Map(current.map(r => [r.lang, r.name]));
const nextByLang = new Map(entries);

const removed = current.filter(r => !nextByLang.has(r.lang)).map(r => r.lang);
if (removed.length > 0) {
    await tx
        .delete(schema.productName)
        .where(and(eq(schema.productName.productId, productId), inArray(schema.productName.lang, removed)));
}

const added = entries.filter(([lang]) => !currentByLang.has(lang));
if (added.length > 0) {
    await tx.insert(schema.productName).values(added.map(([lang, name]) => ({ productId, lang, name })));
}

const changed = entries.filter(([lang, name]) => currentByLang.has(lang) && currentByLang.get(lang) !== name);
// changed → one UPDATE … FROM via getValuesSubquery, never a per-row loop.
```

A plain list of IDs diffs the same way with a `Set`.

## Guarded state transitions

When an UPDATE moves an entity through a one-way lifecycle, the `where` carries the current-state
precondition, `.returning()` reports whether it matched, and zero rows is an error, not a silent
no-op:

```ts
const [cancelled] = await tx
    .update(schema.booking)
    .set({ status: 'CANCELLED', cancelledAt: new Date() })
    .where(
        and(
            eq(schema.booking.id, params.bookingId),
            eq(schema.booking.customerId, params.customerId),
            eq(schema.booking.status, 'CONFIRMED'), // the guard
        ),
    )
    .returning({ id: schema.booking.id });

if (!cancelled) {
    // not found, not owned, or already moved on — report it, don't continue
}
```

Without the guard, a retry or a concurrent call matches the already-transitioned row and overwrites
what the first call wrote (a second `cancelledAt`, an orphaned replacement row).

## Optimistic locking and versioning

Two writers must not both apply a change computed from the same read. Two shapes:

- **Serializable read-modify-write** — read, compute, write inside `transactionSerializable`. A
  concurrent writer aborts with 40001 and the helper retries it against fresh data.
- **Version column** — for an edit whose read happened in an earlier request (a form opened
  minutes ago): the client sends the version it read, the update matches on it and bumps it.

```ts
const [updated] = await database
    .update(schema.page)
    .set({ body: params.body, version: sql`${schema.page.version} + 1` })
    .where(and(eq(schema.page.id, params.pageId), eq(schema.page.version, params.version)))
    .returning({ version: schema.page.version });

if (!updated) {
    // someone else saved first — return a conflict for the caller to resolve
}
```

Supersede-and-replace versioning (insert the new row, then point the old one at it) combines both:
a serializable transaction plus a guarded update on `isNull(old.supersededById)`.

## Raw SQL when Drizzle has no operator

Typed operators first:

```ts
// Bad — not type-checked, breaks silently on a rename:
sql<number>`count(*)::int`;
sql`${t.col} = ${value} AND ${t.col2} IS NOT NULL`;

// Good:
count();
and(eq(t.col, value), isNotNull(t.col2));
```

For constructs Drizzle does not model (`DISTINCT ON`, window functions, LATERAL, row-wise
comparison), interpolate schema references — never type table or column names as strings:

```ts
const m = schema.measurement;
const rows = await database.execute(sql`
    SELECT DISTINCT ON (${m.metricId}) ${m.id}, ${m.metricId}, ${m.value}
    FROM ${m}
    WHERE ${m.deviceId} = ${deviceId}
    ORDER BY ${m.metricId}, ${m.takenAt} DESC
`);

// Keyset pagination — a row-wise comparison:
.where(sql`(${m.takenAt}, ${m.id}) < (${before.takenAt}::timestamptz, ${before.id})`)
```

## Performance basics

- Independent queries run in parallel with `Promise.all`; dependent ones stay sequential.
- Every list query has a `.limit()`.
- Select named columns on wide tables — less I/O, and the result type documents what the caller
  uses.
- Debug SQL by giving the client a Drizzle `logger` enabled only locally behind an env flag; never
  log queries in production.
