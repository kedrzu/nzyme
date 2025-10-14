/**
 * Interface for a getter function that extracts a value from an object.
 * @template TFrom - The type of the object to get the value from
 * @template TValue - The type of the value to get
 * @param value - The object to extract the value from
 * @returns The extracted value
 */
interface Getter<TFrom, TValue> {
    (value: TFrom): TValue;
}

/**
 * Creates a cached version of a getter function.
 * The getter is called only once per object, and subsequent calls return the cached value.
 * The cache is stored on the object itself using a Symbol as the key.
 *
 * Note: The cache is stored directly on the object, so it will persist as long as the object exists.
 * If the object is modified after the first call, the cached value will not be updated.
 *
 * @template TFrom - The type of the object to get the value from
 * @template TValue - The type of the value to get
 * @param getter - The getter function to cache
 * @returns A cached version of the getter function
 *
 * @example
 * ```typescript
 * const getLength = cachedGetter((str: string) => str.length);
 *
 * const str = 'hello';
 * getLength(str); // Computes and returns 5
 * getLength(str); // Returns cached value 5
 *
 * // Different objects get their own cache
 * const str2 = 'world';
 * getLength(str2); // Computes and returns 5
 * ```
 *
 * @example
 * ```typescript
 * // Cache persists even if object is modified
 * const obj = { value: 42 };
 * const getValue = cachedGetter((o: typeof obj) => o.value);
 *
 * getValue(obj); // Returns 42
 * obj.value = 100;
 * getValue(obj); // Still returns 42 (cached value)
 * ```
 */
export function cachedGetter<TFrom, TValue>(getter: Getter<TFrom, TValue>): Getter<TFrom, TValue> {
    const symbol = Symbol();

    return from => {
        const cache = from as Record<symbol, TValue>;
        let value = cache[symbol];
        if (!value) {
            value = getter(from);
            cache[symbol] = value;
        }

        return value;
    };
}
