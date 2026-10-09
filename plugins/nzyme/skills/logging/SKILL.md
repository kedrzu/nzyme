---
name: logging
description: >-
    Structured logging with @nzyme/logging — injecting `Logger`, choosing the level, a constant message
    plus scalar fields, logging caught errors under `error`, ApplicationError data, and capturing logs
    in tests instead of mocking the logger. Use when writing or reviewing code that imports
    @nzyme/logging or calls `logger.info/warn/error/debug`, `useLogger` from @nzyme/vue-ioc, or when
    adding debug output or logging a caught error in a project built on @nzyme/ioc.
---

# Logging

`Logger` from `@nzyme/logging/Logger.js` is an IoC service; every entry goes to the `LoggerTransport`
the app registers in its container (console by default; `@nzyme/logging` also ships pretty CLI and
browser transports and a websocket transport). A deployed transport typically serializes the message
and your object into one structured line, and forwards `error` entries to error tracking — so the
fields you pass are what you can later filter and aggregate on.

## Log level — first match wins

|The entry is…|Level|
|-|-|
|An unexpected failure or data inconsistency someone should investigate|`error`|
|A recoverable problem: retry, fallback, degraded path, threshold breach|`warn`|
|A business event you would search for in production (created, paid, synced)|`info`|
|Development detail: state transitions, cache hits, intermediate values|`debug`|
|Per-item detail inside loops and streams|`trace`|

Expected conditions never go to `error` — where `error` feeds error tracking, each occurrence becomes
an issue and real failures drown. Expected-but-notable → `warn`.

## Inject the logger

`Logger` is a **transient** service named after the unit that declares it (`callerName()`), and that
name is emitted with every entry. Inject it in every service or command that logs; never pass a logger
from one unit to another — the name would lie about the source.

```ts
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

export const ProductSync = defineService({
    name: 'ProductSync',
    deps: { logger: Logger },
    setup({ logger }) {
        return { sync };

        async function sync(productId: string) {
            logger.info('Product sync started', { productId });
        }
    },
});
```

In Vue components and composables, `useLogger('ProductList')` from `@nzyme/vue-ioc/useLogger.js` gives a
logger with an explicit name.

## Constant message, variables in the object

Keep the message text constant so every occurrence of an event groups together; put every variable in
the object, where it is a queryable field instead of text buried in a string.

```ts
// GOOD — stable group key, filterable fields
logger.info('Order shipped', { orderId, carrier: shipment.carrier, itemCount });

// BAD — every line unique, nothing filterable
logger.info(`Order ${orderId} shipped via ${shipment.carrier}`);
```

For long operations add a `durationMs` field so latency is aggregatable.

## Scalars, not whole objects

Each value is a **scalar** you picked — an id, a count, a type, a flag. Passing a whole domain object
(`{ order }`, `{ event }`, `{ result }`) logs every field the type carries today and every field
anyone adds tomorrow — including ones that must never reach logs — bloats every line, and gives you no
stable field to query. Summarize instead: `itemCount`, `hasDiscount`, `status`, the id.

## Caught errors — the whole error under `error`

`LoggerObject` reserves `error?: unknown`. Put the caught error there, unmodified:

```ts
try {
    await pushToWarehouse(orderId);
} catch (error) {
    logger.error('Failed to push order to warehouse', { orderId, error });
    throw error;
}
```

Transports and error trackers need the real error object for its class, stack, `cause` and grouping;
`error.message` or a hand-built `{ message, stack }` produces a synthetic error with the wrong stack and
broken grouping. `ApplicationError` (`@nzyme/logging/ApplicationError.js`) carries structured `data`
alongside the message, and `extractErrorData()` from `@nzyme/logging/extractErrorData.js` lifts that
data (and `cause`) for logging. `HttpError` (`@nzyme/fetch-utils/HttpError.js`) carries `status`.
Error messages end up as issue titles and grouping keys — build them from ids, counts and status codes,
not from user content.

## Tests — capture, never mock

`createTestContainer()` from `@nzyme/ioc-testing/createTestContainer.js` installs a capturing transport
and returns every entry as `logs` (`{ logger, level, message, data }`); outside a container,
`createTestLogger(name)` from `@nzyme/logging/createTestLogger.js` returns a real `Logger` plus `logs`.
Both stay silent unless the test runs with `LOGGING=true`. Mocking `Logger` adds nothing and cannot even
work through `container.set` — the logger is transient, so override `LoggerTransport` if you need a
different sink.

## Anti-patterns

- **Logging secrets** — passwords, tokens, API keys, cookies, signed URLs. Log lines are retained and
  widely readable; log the identifier (`userId`, key name), never the value.
- **String interpolation in the message** — nothing groups or filters.
- **`{ error: error.message }`, a manual `stack` field, or `errorClass`/`errorMessage` fields** — the
  tracker gets a string instead of the exception.
- **Whole domain objects in the payload** — see "Scalars, not whole objects".
- **`console.log` in services, commands or components** — bypasses the transport: no level, no logger
  name, no structure.
- **`error` level for expected conditions** — noise that buries real failures.
- **Mocking or silencing the logger in tests** — use the captured `logs`.
