import { computed, ref } from 'vue';

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
     * The parent loading context, if any.
     */
    parent?: LoadingContext;

    /**
     * The root (top-level) loading context in the hierarchy.
     * If this is the top-level context, it references itself.
     */
    root: LoadingContext;

    /**
     * Whether any child component is currently loading.
     */
    loadingChild: boolean;

    /**
     * Whether this specific context is currently loading (via its own start() calls).
     */
    loadingSelf: boolean;

    /**
     * Whether this context or any of its children are currently loading.
     */
    loading: boolean;

    /**
     * Whether this context has completed loading at least once since being mounted.
     */
    loadedOnce: boolean;

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
 * Configuration options for the loading context.
 */
export interface LoadingContextOptions {
    /**
     * Delay in milliseconds before the loading context is considered loaded.
     */
    delay?: number;
}

/**
 * Internal context extension with methods for parent-child communication.
 */
interface InternalLoadingContext extends LoadingContext {
    incrementChild(): void;
    decrementChild(): void;
}

/**
 * Internal context definition for the loading system.
 */
const LoadingContextSymbol = defineContext<InternalLoadingContext>('LoadingContext');

/**
 * Creates and provides a loading context for child components to communicate their loading states.
 * This function injects any parent context and creates a new context that tracks loading operations
 * both from this component and its children separately.
 *
 * The context uses two reference counters:
 * - One for operations started in this context (loadingSelf)
 * - One for operations started in child contexts (loadingChild)
 *
 * @example
 * ```typescript
 * // In a component
 * const loading = useLoadingContext({ delay: 100 });
 *
 * // Start a loading operation
 * const stopLoading = loading.start();
 * // ... do async work ...
 * stopLoading();
 *
 * // Or use the run helper
 * await loading.run(async () => {
 *   // ... async work ...
 * });
 *
 * // Check loading states
 * console.log(loading.loadingSelf); // true if this context is loading
 * console.log(loading.loadingChild); // true if children are loading
 * console.log(loading.loading); // true if this or children are loading
 * console.log(loading.loadedOnce); // true if loaded at least once
 * ```
 *
 * @param opts Configuration options
 * @returns The loading context interface that this component and child components can access
 */
export function useLoadingContext(opts: LoadingContextOptions = {}): LoadingContext {
    const parent = injectContext(LoadingContextSymbol, { optional: true });

    const counterSelf = ref(0);
    const counterChild = ref(0);
    const loadedOnceRef = ref(false);

    const incrementChild = () => {
        counterChild.value++;
    };

    const decrementChild = () => {
        counterChild.value--;
    };

    const start = () => {
        counterSelf.value++;
        parent?.incrementChild();

        let ended = false;

        return () => {
            if (ended) {
                return;
            }

            ended = true;
            setTimeout(() => {
                counterSelf.value--;
                parent?.decrementChild();

                if (counterSelf.value === 0 && counterChild.value === 0 && !loadedOnceRef.value) {
                    loadedOnceRef.value = true;
                }
            }, opts.delay);
        };
    };

    const run = async <T>(fn: () => Promise<T>) => {
        const finalize = start();
        try {
            return await fn();
        } finally {
            finalize();
        }
    };

    const context: InternalLoadingContext = reactive({
        get parent() {
            return parent ?? undefined;
        },
        get root(): LoadingContext {
            return parent?.root ?? context;
        },
        loadingChild: computed(() => counterChild.value > 0),
        loadingSelf: computed(() => counterSelf.value > 0),
        loading: computed(() => counterSelf.value > 0 || counterChild.value > 0),
        loadedOnce: computed(() => loadedOnceRef.value),
        start,
        run,
        incrementChild,
        decrementChild,
    });

    provideContext(LoadingContextSymbol, context);
    return context;
}
