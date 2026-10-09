# Stateful flow patterns

Composables and stores that manage a retryable, persisted flow — an input with draft persistence,
optimistic sends, rollback on failure, batched syncs — hit the same handful of mistakes.

## Never clear a work queue before processing completes

Remove each pending item only after it succeeds. Clearing upfront means one failed call permanently
loses every unprocessed item. Catch per item and continue, so one failure doesn't block the rest.

- Bad: `const batch = new Map(queue); queue.clear(); for (const item of batch) await process(item);`
- Good: `for (const [key, item] of new Map(queue)) { try { await process(item); queue.delete(key); } catch (error) { logger.warn('Item sync failed', { key, error }); } }`

## Don't update state the app treats as truth before the API call succeeds

Queue the change, call the API, apply the durable update on success. Otherwise state reads "done"
before it is persisted, and transitions can only be tested with sleeps. Purely local, undoable UI is
exempt — an optimistic list item you reconcile with the server response is fine. The rule covers state
something downstream reads as truth: a read pointer, a synced counter, a "saved" flag.

- Bad: `item.lastReadSeq = seq;` immediately, with a debounced API call somewhere else
- Good: queue the mark, debounce, call the API, then `item.lastReadSeq = seq;` on success

## An absent optional context still needs its side effects

When a component injects an optional context and delegates work through it, the branch where the
context is missing must still trigger every side effect the present branch triggers indirectly.
"Optional" means two code paths, and both must be correct — otherwise the fallback silently does
nothing (a badge goes stale when the component renders outside its provider).

- Bad: `listContext?.markRead(id);`
- Good: `if (listContext) { listContext.markRead(id); } else { unreadStore.markRead(id); }`

## Per-user storage must be wiped on every identity change

A client store backed by durable storage (IndexedDB, `localStorage`, an in-memory cache keyed by record
id) holds the current user's data. If it doesn't observe authentication changes, a logout-then-login or
an account switch on the same device leaves drafts, failed sends and cached lists readable by the next
user — a cross-identity leak, not cosmetic staleness. Subscribe to the identity change (an auth event, or
a `watch` on the user id) and **bulk-clear** the storage on every transition, logout included; a
per-key check is not enough.

## One composable per shared state machine

When two views or apps need the same UI state machine — input ref + draft persistence + retry on mount +
send with rollback — put it in one composable that owns the state and returns it, with the variation
(which request to send, how to build the optimistic item) passed in as dependencies. Duplicated state
machines drift (one copy gets the fix), double the review surface, and make each view's tests assert on
incidental wiring instead of the shared contract.
