/**
 * Creates a debounced version of an async function.
 * Ensures that only one instance of the function is running at a time.
 * If called while a previous call is still pending, returns the pending promise.
 *
 * @template T - The return type of the async function
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
export function debounceAsyncFunction<T>(fn: () => Promise<T>) {
    let pending: Promise<T> | undefined;

    return () => {
        if (pending) {
            return pending;
        }

        pending = fn().finally(() => {
            pending = undefined;
        });

        return pending;
    };
}
