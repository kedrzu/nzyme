/**
 * Creates a promise that resolves after the specified number of milliseconds.
 * @util
 *
 * @param ms - Number of milliseconds to wait
 * @returns A promise that resolves after the specified delay
 *
 * @example
 * ```typescript
 * // Wait for 1 second
 * await waitFor(1000);
 * ```
 */
export function waitFor<T = void>(ms?: number, result?: T) {
    return new Promise<T>(resolve => setTimeout(() => resolve(result as T), ms));
}
