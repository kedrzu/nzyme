# Reactive services (frontend stores)

Read when building state shared across components, a service that emits events, or a deduplicated
background task. State used by a single component is a composable instead (composables skill).

A `defineService` can hold Vue reactivity: the state survives and is shared because `setup` runs once
per container. A root container from `createContainer()` in `@nzyme/vue-ioc/createContainer.js` runs
every resolution inside its own detached effect scope, so watchers and computeds created in `setup`
live as long as the container, not as long as the component that first resolved the service.

## Reactive state

Keep refs private in the closure; expose them read-only through `reactive()`, and mutate only through
methods.

```ts
import { defineService } from '@nzyme/ioc/Service.js';
import type { Resolved } from '@nzyme/ioc/Injectable.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { computed, reactive, ref } from 'vue';

export const CartStore = defineService({
    name: 'CartStore',
    deps: { logger: Logger },
    setup({ logger }) {
        const items = ref<CartItem[]>([]);

        const state = reactive({
            items: computed(() => items.value),
            count: computed(() => items.value.length),
        });

        return { state, add, clear };

        function add(item: CartItem) {
            items.value.push(item);
            logger.debug('Cart item added', { productId: item.productId });
        }

        function clear() {
            items.value = [];
        }
    },
});

export type CartStore = Resolved<typeof CartStore>;
```

In a component, resolve it with `useService` — never Vue's raw `inject`:

```vue
<script setup lang="ts">
import { useService } from '@nzyme/vue-ioc/useService.js';
import { computed } from 'vue';

import { CartStore } from './CartStore.js';

const cart = useService(CartStore);
const isEmpty = computed(() => cart.state.count === 0);
</script>

<template>
  <span v-if="!isEmpty">{{ cart.state.count }}</span>
</template>
```

## Events

`createEventEmitter<E>()` (`@nzyme/utils/createEventEmitter.js`) returns `{ event, emit, emitAsync }`.
Expose only `event` (`on`/`off`); keep the emit functions private. `emit` calls listeners without
awaiting them; `emitAsync` awaits each listener in turn.

```ts
setup({ api, logger }) {
    const messageReceived = createEventEmitter<Message>();
    const sendFailed = createEventEmitter<unknown>();

    return {
        send,
        events: { messageReceived: messageReceived.event, sendFailed: sendFailed.event },
    };

    async function send(text: string) {
        try {
            const message = await api.send(text);
            await messageReceived.emitAsync(message);
        } catch (error) {
            logger.error('Failed to send message', { error });
            await sendFailed.emitAsync(error);
        }
    }
},
```

Components subscribe with `onEventEmitter(chat.events.messageReceived, onMessage)` from
`@nzyme/vue-utils/onEventEmitter.js`, which unsubscribes when the component's scope is disposed (see
the composables skill). Code outside components must call `off` itself.

## Deduplicated background tasks — `createSingleRunner`

`createSingleRunner({ handler })` (`@nzyme/utils/createSingleRunner.js`) returns
`{ execute, reset, running, promise, error }`. While a run is in flight, every `execute()` returns
**that same promise** — concurrent callers join it; nothing is queued behind it. The next `execute()`
after it settles starts a fresh run. `reset()` detaches the in-flight run so the next `execute()` starts
a new one; the abandoned handler keeps running to completion, so implement your own cancellation if the
old run must stop. Pass `state: s => reactive(s)` to make `running`/`error` reactive.

```ts
export const CatalogSync = defineService({
    name: 'CatalogSync',
    deps: { api: CatalogClient, logger: Logger },
    setup({ api, logger }) {
        const runner = createSingleRunner({ handler: syncCatalog });

        return {
            /** Fire-and-forget; concurrent calls share one run. */
            sync: () => void runner.execute(),
            /** Resolves when the current (or a new) run finishes. */
            syncAndWait: () => runner.execute(),
        };

        async function syncCatalog() {
            const products = await api.listProducts();
            logger.info('Catalog synced', { productCount: products.length });
        }
    },
});
```

Because a call made mid-run joins the current run instead of scheduling another, a change that lands
during a sync is not picked up by it. If "sync again after the current run" matters, re-check after
`await runner.execute()` or track a dirty flag in the handler. Separate runners per operation run
independently and may run in parallel.
