import debounce from 'lodash.debounce';
import { computed, getCurrentScope, isRef, ref, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

import { isCancelablePromise } from '@nzyme/utils/Cancelable.js';
import type { CancelablePromise } from '@nzyme/utils/Cancelable.js';

import { makeRef } from './reactivity/makeRef.js';
import type { RefParam } from './reactivity/makeRef.js';
import { reactive } from './reactivity/reactive.js';

/**
 * Interface representing a data loader function that fetches data based on parameters
 */
export interface DataSourceLoader<TParams, TResult> {
    (params: TParams, oldValue: TResult | undefined): CancelablePromise<TResult> | Promise<TResult> | TResult;
}

/**
 * Behavior defining when data should be loaded
 * - 'eager': Loads immediately when created
 * - 'lazy': Loads only when accessed
 */
export type DataSourceBehavior = 'eager' | 'lazy';

/**
 * Debounce options
 */
export interface DataSourceDebounceOptions {
    /** Number of milliseconds to debounce api calls */
    time: number;

    /** Whether to trigger on the leading edge of the timeout */
    leading?: boolean;

    /** Whether to trigger on the trailing edge of the timeout */
    trailing?: boolean;
}

/**
 * Configuration options for creating a data source
 */
export interface DataSourceOptions<TParams, TResult, TDefault extends TResult | undefined = undefined> {
    /**
     * Request payload - it will be watched for changes to make calls.
     * Can be function or a reference.
     * If undefined is returned, API call will not be made.
     */
    readonly params?: RefParam<TParams>;

    /**
     * Function that loads data based on the params
     */
    readonly load: DataSourceLoader<TParams, TResult>;

    /**
     * Default value to use when data is not loaded
     */
    readonly default?: RefParam<TDefault>;

    /**
     * Determines when data should be loaded
     */
    readonly behavior?: DataSourceBehavior;

    /**
     * Number of milliseconds to debounce api calls or options for debouncing data loads
     */
    readonly debounce?: number | DataSourceDebounceOptions;

    /**
     * Data will be loaded into this ref. Optional.
     */
    readonly data?: ((result: TResult) => void) | Ref<TResult | undefined>;

    /**
     * Callback that runs after data is loaded successfully
     */
    readonly onLoad?: (result: TResult, params: TParams) => unknown;

    /**
     * Callback that runs when the loader rejects.
     * When provided, the error is delivered here instead of being re-thrown from
     * `get()`/`reload()`, so callers can handle errors without wrapping every
     * access site in try/catch. The reactive `error` prop on the returned data
     * source is still populated regardless.
     */
    readonly onError?: (error: unknown, params: TParams) => unknown;
}

/**
 * A reactive data source that manages loading, caching, and refreshing data
 */
export interface DataSource<TResult, TDefault extends TResult | undefined = undefined> {
    /**
     * The current value of the data source
     */
    value: TDefault | TResult;

    /**
     * Currently pending promise if data is being loaded, otherwise null
     */
    readonly pending: Promise<TResult> | null;

    /**
     * Whether the data has been loaded at least once
     */
    readonly loaded: boolean;

    /**
     * The latest error thrown by the loader, or `null` when the most recent
     * load succeeded (or no load has happened yet). Always populated on
     * failure, regardless of whether `onError` is provided.
     */
    readonly error: unknown;

    /**
     * Get the current data, loading it if necessary
     */
    readonly get: () => Promise<TResult>;

    /**
     * Force reload the data regardless of cache state
     */
    readonly reload: () => Promise<TResult>;

    /**
     * Clear the current data and cancel any pending requests
     */
    readonly clear: () => void;

    /**
     * Mark the current data as stale, will be reloaded on next access
     */
    readonly invalidate: () => void;
}

/**
 * Creates a reactive data source that loads and manages data from an API or other source
 */
export function useDataSource<TParams, TResult, TDefault extends TResult | undefined = undefined>(
    opts: DataSourceOptions<TParams, TResult, TDefault>,
) {
    const behavior = opts.behavior;
    const loadRef = shallowRef(behavior !== 'lazy');
    const defaultRef = makeRef(opts.default);
    const dataRef: Ref<TResult | undefined> = isRef(opts.data) ? opts.data : shallowRef();
    const dataCallback = isRef(opts.data) ? null : opts.data;
    const paramsRef = makeRef(opts.params);
    const dirtyRef = ref(false);
    const loadedRef = ref(false);
    const effectScope = getCurrentScope();

    const pendingRef = ref<Promise<TResult> | null>(null);
    const errorRef = shallowRef<unknown>(null);

    const debounceOptions = getDebounceOptions(opts.debounce);
    const debouncedLoad = debounceOptions ? debounce(loadData, debounceOptions.time, debounceOptions) : loadData;

    const value = computed<TDefault | TResult>({
        get: () => {
            loadRef.value = true;
            const data = dataRef.value;
            if (data === undefined) {
                return defaultRef.value as TDefault;
            }

            return data;
        },
        set: (newValue: TDefault | TResult) => {
            dataRef.value = newValue;
        },
    });

    watch(paramsRef, debouncedLoad, { deep: true, immediate: behavior === 'eager' });
    if (behavior === 'lazy') {
        watch(loadRef, () => {
            if (!pendingRef.value) {
                void debouncedLoad();
            }
        });
    }

    const dataSource = reactive<DataSource<TResult, TDefault>>({
        value,
        pending: computed(() => pendingRef.value),
        loaded: computed(() => loadedRef.value),
        error: computed(() => errorRef.value),
        get,
        reload,
        clear,
        invalidate,
    });

    return dataSource;

    async function get(): Promise<TResult> {
        loadRef.value = true;

        const pending = pendingRef.value;
        if (pending) {
            return await pending;
        }

        if (dataRef.value !== undefined && !dirtyRef.value) {
            return dataRef.value;
        }

        return await reload();
    }

    async function reload(): Promise<TResult> {
        loadRef.value = true;

        if ('flush' in debouncedLoad) {
            void debouncedLoad();
            return (await debouncedLoad.flush()) as TResult;
        }

        return (await debouncedLoad()) as TResult;
    }

    function clear() {
        const pending = pendingRef.value;
        if (pending && isCancelablePromise(pending)) {
            pending.cancel();
        }

        pendingRef.value = null;
        dataRef.value = undefined;
        errorRef.value = null;
        if (behavior === 'lazy') {
            loadRef.value = false;
        }
    }

    function invalidate() {
        if (behavior === 'lazy') {
            loadRef.value = false;
        }

        dirtyRef.value = true;
    }

    // function used to load the data
    async function loadData() {
        if (!loadRef.value) {
            return;
        }

        const pending = pendingRef.value;
        if (pending && isCancelablePromise(pending)) {
            pending.cancel();
        }

        pendingRef.value = null;

        const params = paramsRef.value;
        let promise: Promise<TResult> | undefined;
        let result: TResult;

        try {
            pendingRef.value = promise = Promise.resolve(opts.load(params as TParams, dataRef.value));

            result = await promise;

            dataRef.value = result;
            dirtyRef.value = false;
            loadedRef.value = true;
            errorRef.value = null;
            if (dataCallback) {
                dataCallback(result);
            }
        } catch (error) {
            errorRef.value = error;

            const onError = opts.onError;
            if (!onError) {
                throw error;
            }

            if (effectScope) {
                effectScope.run(() => onError(error, params as TParams));
            } else {
                onError(error, params as TParams);
            }

            return undefined as unknown as TResult;
        } finally {
            // we need to check if this is really the same request we started
            // because in the meantime some other request might start
            if (pendingRef.value === promise) {
                pendingRef.value = null;
            }
        }

        const onLoad = opts.onLoad;
        if (onLoad) {
            if (effectScope) {
                effectScope.run(() => onLoad(result, params as TParams));
            } else {
                onLoad(result, params as TParams);
            }
        }

        return result;
    }
}

function getDebounceOptions(
    debounceConfig: number | DataSourceDebounceOptions | undefined,
): Required<DataSourceDebounceOptions> | undefined {
    if (!debounceConfig) {
        return undefined;
    }

    if (typeof debounceConfig === 'number') {
        return { time: debounceConfig, leading: true, trailing: true };
    }

    return {
        time: debounceConfig.time,
        leading: debounceConfig.leading ?? true,
        trailing: debounceConfig.trailing ?? true,
    };
}
