/**
 * @deprecated Use {@link waitFor} instead
 * @param ms - Number of milliseconds to wait
 * @returns A promise that resolves after the specified delay
 */
export function timeout(ms: number) {
    return waitFor(ms);
}

/**
 * Creates a promise that resolves after the specified number of milliseconds.
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
export function waitFor(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}
