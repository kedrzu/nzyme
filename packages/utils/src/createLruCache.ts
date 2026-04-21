/**
 * Options for creating an LRU cache.
 * @template K - The type of the cache keys
 * @template V - The type of the cached values
 */
export interface CreateLruCacheOptions<K, V> {
    /** Maximum number of entries before the least recently used is evicted. */
    maxSize: number;
    /**
     * Backing map for the cache. Pass `reactive(new Map())` to make the cache reactive in Vue.
     * Defaults to a plain `Map`.
     */
    cache?: Map<K, V>;
}

/**
 * An LRU (Least Recently Used) cache that evicts the oldest entry when capacity is exceeded.
 * @template K - The type of the cache keys
 * @template V - The type of the cached values
 */
export interface LruCache<K, V> {
    /** Get a value by key. Moves the entry to most-recently-used position. */
    get(key: K): V | undefined;
    /** Set a value. Evicts the least recently used entry if at capacity. */
    set(key: K, value: V): void;
    /** Check if a key exists without affecting recency. */
    has(key: K): boolean;
    /** Delete a key. Returns true if the key existed. */
    delete(key: K): boolean;
    /** Remove all entries. */
    clear(): void;
    /** Iterate over all values in insertion order (oldest first). */
    values(): IterableIterator<V>;
    /** Iterate over all keys in insertion order (oldest first). */
    keys(): IterableIterator<K>;
    /** Current number of entries. */
    readonly size: number;
    /** The underlying map. */
    readonly cache: Map<K, V>;
}

/**
 * Creates an LRU cache backed by a Map.
 * Map preserves insertion order — delete+set moves an entry to the end (most recent).
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createLruCache<K, V>(options: CreateLruCacheOptions<K, V>): LruCache<K, V> {
    const { maxSize } = options;
    const cache = options.cache ?? new Map<K, V>();

    return {
        get,
        set,
        has,
        delete: deleteKey,
        clear,
        values: () => cache.values(),
        keys: () => cache.keys(),
        get size() {
            return cache.size;
        },
        cache,
    };

    function get(key: K): V | undefined {
        if (!cache.has(key)) {
            return undefined;
        }
        const value = cache.get(key);
        // Move to most recent by re-inserting
        cache.delete(key);
        cache.set(key, value as V);
        return value;
    }

    function set(key: K, value: V): void {
        // If key already exists, delete first to update insertion order
        cache.delete(key);

        if (cache.size >= maxSize) {
            // Evict the oldest (first) entry — iterate keys() to handle
            // cases where `undefined` itself is a valid key.
            for (const oldest of cache.keys()) {
                cache.delete(oldest);
                break;
            }
        }

        cache.set(key, value);
    }

    function has(key: K): boolean {
        return cache.has(key);
    }

    function deleteKey(key: K): boolean {
        return cache.delete(key);
    }

    function clear(): void {
        cache.clear();
    }
}
