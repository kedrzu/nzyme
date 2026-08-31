/**
 * Type representing a memoized value with utility methods.
 * @template T - The type of the memoized value
 */
export type Memo<T> = {
    /** Returns the memoized value, computing it if necessary */
    (): T;
    /** Clears the memoized value */
    clear: () => void;
    /** Returns the current memoized value without computing it */
    value: () => T | undefined;
};

/**
 * Type representing an async memoized value with utility methods.
 * @template T - The type of the memoized value
 */
export type MemoAsync<T> = T extends Promise<infer U> ? MemoAsyncInner<U> : MemoAsyncInner<T>;

type MemoAsyncInner<T> = {
    /** Returns a promise that resolves to the memoized value */
    (): Promise<T>;
    /** Clears the memoized value and promise */
    clear: () => void;
    /** Returns the current promise without creating a new one */
    promise: () => Promise<T> | undefined;
    /** Returns the current memoized value if available */
    value: () => T | undefined;
};

/**
 * Creates a memoized function that caches its result.
 * The value is computed only once and then cached until cleared.
 * @util
 *
 * @template T - The type of the memoized value
 * @param factory - Function that computes the value to memoize
 * @returns A memoized function with utility methods
 *
 * @example
 * ```typescript
 * const expensive = createMemo(() => {
 *     console.log('Computing...');
 *     return 42;
 * });
 *
 * console.log(expensive()); // Logs "Computing..." and returns 42
 * console.log(expensive()); // Returns 42 (no computation)
 * expensive.clear();
 * console.log(expensive()); // Logs "Computing..." and returns 42
 * ```
 */
export function createMemo<T>(factory: () => T) {
    let valueSet: boolean = false;
    let value: T | undefined;

    const memo: Memo<T> = (() => {
        if (!valueSet) {
            value = factory();
            valueSet = true;
        }

        return value;
    }) as Memo<T>;

    memo.clear = () => {
        value = undefined;
        valueSet = false;
    };

    memo.value = () => value;

    return memo;
}

/**
 * Creates an async memoized function that caches its result.
 * The value is computed only once and then cached until cleared.
 * @util
 *
 * @template T - The type of the memoized value
 * @param factory - Async function that computes the value to memoize
 * @returns An async memoized function with utility methods
 *
 * @example
 * ```typescript
 * const expensive = createMemoAsync(async () => {
 *     console.log('Computing...');
 *     await waitFor(1000);
 *     return 42;
 * });
 *
 * await expensive(); // Logs "Computing..." and returns 42 after 1s
 * await expensive(); // Returns 42 immediately
 * expensive.clear();
 * await expensive(); // Logs "Computing..." and returns 42 after 1s
 * ```
 */
export function createMemoAsync<T>(factory: () => Promise<T>) {
    let promise: Promise<T> | undefined;
    let value: T | undefined;

    const memo: MemoAsync<T> = (() => {
        if (!promise) {
            promise = factory().then(result => {
                value = result;
                return result;
            });
        }

        return promise;
    }) as MemoAsync<T>;

    memo.clear = () => {
        promise = undefined;
        value = undefined;
    };

    memo.promise = () => promise;
    memo.value = () => value;

    return memo;
}
