import { computed, ref, watch } from 'vue';

import { defineContext, injectContext, provideContext } from './context.js';
import { reactive } from './reactivity/reactive.js';

/**
 * Handler for the loading context that child components use to signal when their loading is complete.
 * Call this function when the loading operation is finished to decrement the loading counter.
 */
export interface LoadingContextHandler {
    /** Executing the handler will mark end of loading for this specific operation. */
    (): void;
}

/**
 * Context interface that allows child components to communicate loading states to parent components.
 * Parent components provide this context and can react to loading states by showing loaders or
 * executing callbacks when all loading operations are complete.
 */
export interface LoadingContext {
    /**
     * Whether any loading operations are currently in progress.
     * This is true when at least one child component has started loading but hasn't finished yet.
     */
    isLoading: boolean;
    /**
     * Start a new loading operation. Child components call this to inform the parent
     * that they are beginning a loading operation.
     *
     * @returns A handler function that must be called when the loading operation is complete
     */
    start(): LoadingContextHandler;

    /**
     * Run a function and wait for it to finish.
     *
     * @param fn The function to run
     * @returns The result of the function
     */
    run<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Configuration options for the loading context provider.
 * These callbacks allow parent components to react when all child loading operations complete.
 */
export interface LoadingContextOptions {
    /**
     * Delay in milliseconds before the loading context is considered loaded.
     */
    delay?: number;

    /**
     * Callback that is called every time all loading operations finish.
     * This will be triggered each time the loading counter reaches zero.
     */
    onLoaded?: () => unknown;

    /**
     * Callback that is called when all loading operations finish for the first time only.
     * Useful for one-time initialization or setup after the initial load.
     */
    onLoadedOnce?: () => unknown;
}

/**
 * Internal context definition for the loading system.
 */
const LoadingContext = defineContext<LoadingContext>('LoadingContext');

const dummyContext: LoadingContext = {
    isLoading: false,
    start: () => () => {},
    run: f => f(),
};

/**
 * Hook for child components to access the loading context provided by a parent component.
 * If no loading context is provided by a parent, returns a dummy context that does nothing.
 *
 * @example
 * ```typescript
 * // In a child component
 * const loading = useLoadingContext();
 * const stopLoading = loading.start(); // Inform parent that loading started
 *
 * // Later, when loading is done
 * stopLoading(); // Inform parent that loading finished
 * ```
 *
 * @returns The loading context interface
 */
export function useLoadingContext(): LoadingContext {
    return injectContext(LoadingContext, { optional: true }) ?? dummyContext;
}

let i = 0;

/**
 * Provides a loading context for child components to communicate their loading states.
 * Parent components use this to set up loading tracking and react when all operations complete.
 *
 * The context uses a reference counter - each call to `start()` increments the counter,
 * and calling the returned handler decrements it. The `isLoading` state is true when
 * the counter is greater than zero.
 *
 * @example
 * ```typescript
 * // In a parent component
 * const loading = provideLoadingContext({
 *   onLoaded: () => console.log('All loading finished!'),
 *   onLoadedOnce: () => console.log('Initial load complete!')
 * });
 *
 * // Now child components can use useLoadingContext() to report their loading states
 * ```
 *
 * @param opts Configuration options for callbacks
 * @returns The loading context interface that child components can access
 */
export function provideLoadingContext(opts: LoadingContextOptions = {}): LoadingContext {
    const parent = useLoadingContext();
    const counter = ref(0);
    const onLoaded = opts.onLoaded;
    const onLoadedOnce = opts.onLoadedOnce;

    let loadedOnce = false;

    const start: LoadingContext['start'] = () => {
        const parentStart = parent.start();
        counter.value++;
        let ended = false;

        return () => {
            if (ended) {
                return;
            }

            ended = true;
            setTimeout(() => {
                counter.value--;
                parentStart();

                if (counter.value === 0) {
                    onLoaded?.();
                    if (!loadedOnce) {
                        loadedOnce = true;
                        onLoadedOnce?.();
                    }
                }
            }, opts.delay);
        };
    };

    const run: LoadingContext['run'] = async fn => {
        const finalize = start();
        try {
            return await fn();
        } finally {
            finalize();
        }
    };

    const context = reactive<LoadingContext>({
        isLoading: computed(() => counter.value > 0),
        start,
        run,
    });

    return provideContext(LoadingContext, context);
}
