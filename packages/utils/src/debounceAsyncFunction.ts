interface DebounceAsyncFunctionOptions {
    trailing?: boolean;
}

/**
 * Creates a debounced version of an async function.
 * Ensures that only one instance of the function is running at a time.
 * If called while a previous call is still pending, returns the pending promise.
 *
 * @template R - The return type of the async function
 * @param fn - The async function to debounce
 * @returns A debounced version of the function
 *
 * @example
 * ```typescript
 * const fetchData = debounceAsyncFunction(async () => {
 *     // Expensive operation
 *     return await api.getData();
 * });
 *
 * // First call starts the operation
 * const promise1 = fetchData();
 *
 * // Second call while first is still running returns the same promise
 * const promise2 = fetchData();
 *
 * // Both promises resolve to the same result
 * console.log(await promise1 === await promise2); // true
 * ```
 */
export function debounceAsyncFunction<P extends unknown[], R>(
    fn: (...args: P) => Promise<R>,
    options: DebounceAsyncFunctionOptions = {},
) {
    let pending: Promise<R> | undefined;
    let waiting: P | undefined;
    const trailing = options.trailing ?? false;

    const debounced = (...args: P) => {
        if (pending) {
            waiting = args;
            return pending;
        }

        pending = fn(...args).finally(() => {
            pending = undefined;

            if (trailing && waiting !== undefined) {
                const args = waiting;
                waiting = undefined;
                void debounced(...args);
            }
        });

        return pending;
    };

    return debounced;
}
