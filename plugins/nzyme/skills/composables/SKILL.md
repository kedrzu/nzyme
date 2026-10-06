---
name: composables
description: >-
    Vue composables with @nzyme/vue-utils and @nzyme/vue-ioc — naming, the reactive() return shape and
    the typed `reactive` re-export, MaybeRefOrGetter options with makeRef, data loading with
    useDataSource, injecting with useService/useLogger, events with createEventEmitter, onEventEmitter
    and onWindowEvent, per-item effects with mapScopedArray, plus Vue reactivity and stateful-flow
    pitfalls. Use when writing or reviewing a `use[Feature]` composition function or component-scoped
    reactive logic in a project that imports @nzyme/vue-utils or @nzyme/vue-ioc. Not for: state shared
    across components (a defineService store — ioc skill) or form state and validation (forms skill).
---

# Composables

A composable (`use[Feature]`) encapsulates **component-scoped** stateful logic: each call creates an
independent instance whose watchers and listeners die with the calling component's effect scope.

## When NOT to use

- **State shared across components or cached beyond one component** → a `defineService` store (ioc
  skill, `references/reactive-services.md`).
- **Form state and validation** → forms skill.
- **Logic used by exactly one component** → keep it in that component's setup; extraction without reuse
  only adds indirection.

Before writing one, check `@nzyme/vue-utils` (and `@vueuse/core` if the project uses it) for a
ready-made composable.

A store and a composable often pair up: a singleton `CartStore` (service) owns the cache that outlives
every view, while `useCart()` adds what must die with the view — a listener, a watcher — around it.

## Return shape — first match wins

|The composable exposes|Return|Why|
|-|-|-|
|A `DataSource` and nothing else|the `DataSource` as-is|already reactive; re-wrapping adds nothing|
|One derived value|the `computed` directly|nothing to group|
|Reactive state (with or without functions)|`reactive({ ... })` typed by a `[Feature]ViewModel` interface|consumers read `vm.loaded` without `.value`|
|Functions only|a plain object|nothing reactive to proxy|

## Naming

- `use[Feature]()` in a file named after it (`useOrderStatus.ts`).
- Options: a `Use[Feature]Options` interface whose properties are `MaybeRefOrGetter<T>`.
- Return type: a `[Feature]ViewModel` interface with `readonly` properties — `readonly` stops consumers
  from writing through the proxy into your internal refs.

## Canonical shape

```ts
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import { onScopeDispose, reactive, ref, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { GetOrderStatusCommand } from '../services/GetOrderStatusCommand.js';

export interface UseOrderStatusOptions {
    orderId: MaybeRefOrGetter<string | undefined>;
}

export function useOrderStatus(options: UseOrderStatusOptions) {
    const getOrderStatus = useService(GetOrderStatusCommand);
    const logger = useLogger('useOrderStatus');

    const orderId = makeRef(options.orderId); // normalize before first use
    const status = ref<OrderStatus | null>(null);
    let timer: ReturnType<typeof setInterval> | undefined;

    watch(orderId, id => (id ? startPolling(id) : stopPolling()), { immediate: true });
    onScopeDispose(stopPolling);

    return reactive({ status });

    function startPolling(id: string) {
        stopPolling();
        timer = setInterval(() => void refresh(id), 5_000);
    }

    function stopPolling() {
        clearInterval(timer);
    }

    async function refresh(id: string) {
        try {
            status.value = await getOrderStatus(id);
        } catch (error) {
            logger.warn('Order status refresh failed', { orderId: id, error });
        }
    }
}
```

### Why `reactive()` around the return

The reactive proxy unwraps refs on access and tracks the read: `vm.status` is the value, and the
consuming template re-renders when it changes. Without it every property stays a `Ref` — a ViewModel
interface with plain types becomes unimplementable, and `{{ vm.status }}` renders an object.

To declare the type on the call, use `reactive` from `@nzyme/vue-utils/reactivity/reactive.js`. Vue's
own `reactive<OrderViewModel>({ loaded: computed(...) })` is a **compile error** — its input type has no
per-property ref unwrapping; the nzyme re-export accepts `Ref<T[K]> | T[K]` per property and returns
`T`. Vue's `reactive` without a type parameter is fine when you don't declare a ViewModel.

**Never destructure a reactive return** — `const { status } = useOrderStatus(...)` copies the value
once and never updates. Keep the object or use `toRefs`.

### `MaybeRefOrGetter` options

|Caller passed|`options.x` used raw|`makeRef(options.x).value`|
|-|-|-|
|`'123'`|works — by luck|works|
|`ref('123')`|leaks the Ref object into comparisons and text|works, stays reactive|
|`() => route.params.id`|the getter is never called — permanently stale|works — becomes a `computed`|

`makeRef` (`@nzyme/vue-utils/reactivity/makeRef.js`) returns a ref as-is, wraps a function in
`computed` and a value in `ref`. Normalize once at the top and treat everything as refs after that. For
a one-shot read inside a getter you already own (a `useDataSource` `params` getter), Vue's `toValue` is
enough.

## Data loading — `useDataSource`

`useDataSource` (`@nzyme/vue-utils/useDataSource.js`) loads whenever its `params` change (watched
deeply):

```ts
const product = useDataSource({
    params: () => ({ productId: toValue(options.productId) }),
    // useDataSource does NOT skip undefined params — guard inside load
    load: ({ productId }) => (productId ? getProduct(productId) : Promise.resolve(null)),
    default: () => null,
    behavior: 'eager',
});

return product; // already reactive — return as-is
```

Options: `params`, `load(params, oldValue)`, `default`, `behavior`, `debounce` (ms, or
`{ time, leading, trailing }`), `onLoad`, `onError` (when given, loader errors go there instead of being
re-thrown from `get()`/`reload()`).

Set `behavior` explicitly: `'eager'` loads immediately and on every params change; `'lazy'` loads on
first access of `.value` or `get()`; unset loads only on a params *change* or an explicit `get()` — no
initial load, rarely what you want.

|Member|Meaning|
|-|-|
|`value`|current data, else `default`|
|`loaded`|loaded successfully at least once|
|`pending`|the in-flight promise, else `null`|
|`error`|last loader error; cleared on success|
|`get()`|cached value, loading only if missing or invalidated|
|`reload()`|force a reload now|
|`invalidate()`|mark stale — the old value **stays visible** and reloads on next `get()` (`lazy`: next `.value` access)|
|`clear()`|reset value and error to `default` now and cancel a cancelable in-flight load|

`invalidate()` is stale-while-revalidate for the same subject (after a mutation). `clear()` is an
identity switch — the subject changed and stale data would render mixed-identity frames (the new id with
the previous record's name), so call it from a `watch` on the id.

Don't hand-roll `onMounted` + a loading ref + `try/catch` around a fetch — `useDataSource` already gives
`loaded`/`pending`/`error`.

## Injecting services

`useService(Unit)` from `@nzyme/vue-ioc/useService.js`; `useLogger(name)` from
`@nzyme/vue-ioc/useLogger.js`. Inject what the frontend container actually registers — server-only
services are not there and fail at runtime; import their types only.

**Call `useService` unconditionally at the top of setup — gate the use, not the call.** It is backed by
`inject()`, which only works synchronously during setup:

- Bad: `const auth = options.requireAuth ? useService(AuthStore) : undefined;`
- Good: `const auth = useService(AuthStore);` and read `auth.user` only when `options.requireAuth`.

## Events

`createEventEmitter` (`@nzyme/utils/createEventEmitter.js`) returns `{ event, emit, emitAsync }`; expose
`event`. Subscribe with `onEventEmitter` (`@nzyme/vue-utils/onEventEmitter.js`) and listen to the
window with `onWindowEvent` (`@nzyme/vue-utils/onWindowEvent.js`) — both remove themselves when the
scope is disposed.

```ts
export function useKeyShortcut(key: string) {
    const { event, emitAsync } = createEventEmitter<KeyboardEvent>();

    onWindowEvent('keydown', async e => {
        if (e.key === key) {
            e.preventDefault();
            await emitAsync(e);
        }
    });

    return { event };
}
```

`onEventEmitter` also takes a **getter or ref** that may yield `null`/`undefined`, and re-subscribes
when the emitter appears or changes: `onEventEmitter(() => props.shortcut?.event, click)`.

**Scope law:** all of this cleanup rides on `onScopeDispose`, which needs an active effect scope. Call
composables synchronously at the top of `setup()`/`<script setup>` or inside another composable — never
after an `await` and never in an event handler, or the cleanup never registers and listeners outlive the
component.

## Pitfalls

|Situation|Rule|Detail|
|-|-|-|
|Watching a value that can reset to `null`|Handle the `null` branch — reset local state to its default|`references/reactivity-pitfalls.md`|
|Fetching keyed by an id that changes|`useDataSource` with `clear()` on the id switch, not `computedAsync`|same|
|A composable with effects inside `array.map()`|`mapScopedArray(() => arr, item => ...)`|same|
|`isBrowser()` guard in browser-only code|Delete it|same|
|Draining a queue of pending operations|Remove each item only after it succeeds|`references/stateful-flow-patterns.md`|
|Updating state the app treats as truth before the API call|Apply it only after success|same|
|An optional injected context is absent|The fallback path must fire the same side effects|same|
|A store persists per-user data|Wipe it on every identity change, logout included|same|
|Two views need the same input/persist/retry state machine|One composable owning it, variation injected|same|

## Anti-patterns

|Anti-pattern|Concrete failure|
|-|-|
|Calling a composable after `await` or in an event handler|No active scope → listeners and watchers keep firing after unmount|
|Destructuring a reactive return|Copies the value once; the UI never updates|
|Vue's `reactive<ViewModel>({ x: computed(...) })`|Compile error → temptation to cast; use the nzyme `reactive`|
|Reading a `MaybeRefOrGetter` option without `makeRef`/`toValue`|Getter callers get a stale value, ref callers leak a Ref — both silent|
|Assuming `useDataSource` skips `undefined` params|The load fires with `undefined`; guard inside `load`|
|Module-level `ref` in a composable file|An accidental singleton shared by every instance (and every user under SSR) — make it a store|
|Non-`readonly` ViewModel properties|Consumers write through the proxy into internal state|
