import { identity } from './functions/identity.js';

/**
 * Options for creating a cache.
 * @template TArg - The type of the argument used to look up values
 * @template TValue - The type of the cached values
 */
export interface CacheOptions<TArg, TValue, TKey = TArg> {
    /** Function that generates a cache key from an argument */
    cacheKey?: (arg: TArg) => TKey;
    /** Function that computes a value if it's not in the cache */
    getValue: (arg: TArg) => TValue;
}

/**
 * Creates a cache that stores values based on a key derived from an argument.
 * Values are computed on demand and cached for future use.
 * @util
 *
 * @template TArg - The type of the argument used to look up values
 * @template TValue - The type of the cached values
 * @param options - Configuration for the cache
 * @returns An object with `get` and `set` methods for accessing the cache
 *
 * @example
 * ```typescript
 * const cache = createCache({
 *     cacheKey: (n: number) => n,
 *     getValue: (n: number) => n * 2
 * });
 *
 * cache.get(5); // Computes and returns 10
 * cache.get(5); // Returns cached value 10
 * cache.set(5, 20); // Overwrites cached value
 * cache.get(5); // Returns 20
 * ```
 */
export function createCache<TArg, TValue, TKey = TArg>(options: CacheOptions<TArg, TValue, TKey>) {
    const cache = new Map<TKey, TValue | undefined>();
    const { cacheKey = identity, getValue } = options;

    return {
        get,
        set,
    };

    function get(arg: TArg) {
        const key = cacheKey(arg);
        let value = cache.get(key);

        if (value === undefined) {
            value = getValue(arg);
            cache.set(key, value);
        }

        return value;
    }

    function set(arg: TArg, value: TValue) {
        const key = cacheKey(arg);
        cache.set(key, value);
    }
}
