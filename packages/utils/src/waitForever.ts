/**
 * Creates a promise that never resolves.
 * This can be useful for creating infinite waits or preventing a promise chain from completing.
 * @util
 *
 * @returns A promise that never resolves
 *
 * @example
 * ```typescript
 * // Wait forever (or until the process is terminated)
 * await waitForever();
 * ```
 */
export function waitForever(): Promise<never> {
    return new Promise<never>(() => {
        void 0;
    });
}
