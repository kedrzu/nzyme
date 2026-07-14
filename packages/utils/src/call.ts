/**
 * Calls a function and returns its result.
 * This is a utility function that can be used to call a function in a more functional style.
 * @util
 *
 * @template T - The return type of the function
 * @param fn - The function to call
 * @returns The result of calling the function
 *
 * @example
 * ```typescript
 * const result = call(() => 42); // result = 42
 * ```
 */
export function call<T>(fn: () => T): T {
    return fn();
}
