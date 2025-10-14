import { identity } from './functions/identity.js';

/**
 * Options for creating an async cache.
 * @template TArg - The type of the argument used to look up values
 * @template TValue - The type of the cached values
 * @template TKey - The type of the cache key
 */
export interface AsyncCacheOptions<TArg, TValue, TKey = TArg> {
    /** Function that generates a cache key from an argument */
    cacheKey?: (arg: TArg) => TKey;
    /** Function that computes a value asynchronously if it's not in the cache */
    getValue: (arg: TArg) => Promise<TValue> | TValue;
    /** Optional error handler for promise rejections */
    onError?: (error: unknown, arg: TArg) => void;
}

/**
 * Creates an async cache that stores values based on a key derived from an argument.
 * Values are computed asynchronously on demand and cached for future use.
 * Concurrent requests for the same key are deduplicated.
 *
 * @template TArg - The type of the argument used to look up values
 * @template TValue - The type of the cached values
 * @template TKey - The type of the cache key
 * @param options - Configuration for the async cache
 * @returns An object with `get` and `set` methods for accessing the cache
 *
 * @example
 * ```typescript
 * const cache = createAsyncCache({
 *     cacheKey: (id: string) => id,
 *     getValue: async (id: string) => {
 *         const response = await fetch(`/api/items/${id}`);
 *         return response.json();
 *     },
 *     onError: (error, id) => console.error(`Failed to fetch item ${id}:`, error)
 * });
 *
 * const item = await cache.get('123'); // Fetches from API
 * const sameItem = await cache.get('123'); // Returns cached value
 * cache.set('123', newData); // Overwrites cached value
 * ```
 */
export function createAsyncCache<TArg, TValue, TKey = TArg>(options: AsyncCacheOptions<TArg, TValue, TKey>) {
    const cache = new Map<TKey, TValue>();
    const pendingRequests = new Map<TKey, Promise<TValue>>();
    const { cacheKey = identity, getValue, onError } = options;

    return {
        get,
        getCached,
        set,
        clear,
        has,
        delete: deleteKey,
        values: () => cache.values(),
    };

    /**
     * Gets a value by argument, using cache if available or computing it asynchronously.
     * Multiple concurrent requests for the same key will be deduplicated.
     *
     * @param arg - The argument to retrieve the value for
     * @returns Promise resolving to the cached or computed value
     */
    async function get(arg: TArg): Promise<TValue> {
        const key = cacheKey(arg);

        // Return cached result if available
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        // Return pending request if one exists to avoid duplicate calls
        const pending = pendingRequests.get(key);
        if (pending) {
            return pending;
        }

        // Create new request
        const request = Promise.resolve(getValue(arg));
        pendingRequests.set(key, request);

        try {
            const result = await request;

            // Store in cache
            cache.set(key, result);

            return result;
        } catch (error) {
            // Call error handler if provided
            if (onError) {
                onError(error, arg);
            }
            throw error;
        } finally {
            // Clean up pending request
            pendingRequests.delete(key);
        }
    }

    function getCached(arg: TArg): TValue | undefined {
        const key = cacheKey(arg);
        return cache.get(key);
    }

    /**
     * Sets a value in the cache for the given argument.
     *
     * @param arg - The argument to set the value for
     * @param value - The value to cache
     */
    function set(arg: TArg, value: TValue): void {
        const key = cacheKey(arg);
        cache.set(key, value);
    }

    /**
     * Clears all cached values and pending requests.
     */
    function clear(): void {
        cache.clear();
        pendingRequests.clear();
    }

    /**
     * Checks if a value is cached for the given argument.
     *
     * @param arg - The argument to check
     * @returns True if the value is cached, false otherwise
     */
    function has(arg: TArg): boolean {
        const key = cacheKey(arg);
        return cache.has(key);
    }

    /**
     * Deletes a cached value for the given argument.
     *
     * @param arg - The argument to delete the cached value for
     * @returns True if the value was deleted, false if it wasn't cached
     */
    function deleteKey(arg: TArg): boolean {
        const key = cacheKey(arg);
        pendingRequests.delete(key);
        return cache.delete(key);
    }
}
