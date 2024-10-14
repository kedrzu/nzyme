import type { ComputedRef } from 'vue';
import { computed, nextTick, shallowRef, watchEffect } from 'vue';

export interface ComputedAsyncOptions {
    /**
     * Should value be evaluated lazily
     *
     * @default false
     */
    lazy?: boolean;

    /**
     * Callback when error is caught.
     */
    onError?: (e: unknown) => void;
}

export type ComputedAsync<T> = ComputedRef<T> & {
    get: () => Promise<T>;

    /**
     * Manually trigger the re-evaluation of the computed value
     */
    refresh: () => Promise<T>;

    /**
     * Manually invalidate computed value
     */
    invalidate: () => void;
};

/**
 * Create an asynchronous computed dependency.
 * Based on @see https://vueuse.org/computedAsync
 * @param evaluation     The promise-returning callback which generates the computed value
 */
export function computedAsync<T>(
    evaluation: () => T | Promise<T>,
    options: ComputedAsyncOptions = {},
): ComputedAsync<T> {
    const { lazy = false, onError } = options;

    const started = shallowRef(!lazy);
    const currentRef = shallowRef<T>();
    let pending: Promise<T> | undefined;

    watchEffect(() => {
        if (!started.value) {
            return;
        }

        if (onError) {
            void refresh().catch(onError);
        } else {
            void refresh();
        }
    });

    const valueRef = (
        lazy
            ? computed(() => {
                  started.value = true;
                  return currentRef.value;
              })
            : currentRef
    ) as ComputedAsync<T>;

    valueRef.get = get;
    valueRef.invalidate = invalidate;
    valueRef.refresh = refresh;

    return valueRef;

    async function get() {
        const value = currentRef.value;
        if (value !== undefined) {
            return value;
        }

        // Wait for the watchers to propagate
        await nextTick();

        if (pending) {
            return await pending;
        }

        return await refresh();
    }

    function invalidate() {
        currentRef.value = undefined;
        pending = undefined;
    }

    async function refresh() {
        let promise: Promise<T> | undefined;

        try {
            promise = pending = Promise.resolve(evaluation());

            const result = await promise;

            // Only update the value if the promise is still the same
            if (pending === promise) {
                currentRef.value = result;
            }

            return result;
        } catch (e) {
            // Prevent from throwing the same error all over again
            if (pending === promise) {
                pending = undefined;
            }

            throw e;
        }
    }
}
