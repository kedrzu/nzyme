/**
 * Error thrown when an operation does not settle within its deadline.
 *
 * `name` is deliberately `'TimeoutError'` — the same name a `DOMException` from
 * `AbortSignal.timeout()` carries, so duck-typed checks that already accept
 * `'AbortError' | 'TimeoutError'` keep working without importing this class.
 *
 * @example
 * ```typescript
 * try {
 *     await withTimeout({ operation: signal => fetch(url, { signal }), timeoutMs: 3000 });
 * } catch (e) {
 *     if (e instanceof TimeoutError) {
 *         console.log(`Gave up after ${e.timeoutMs}ms`);
 *     }
 * }
 * ```
 */
export class TimeoutError extends Error {
    /** The deadline, in milliseconds, that elapsed. */
    public readonly timeoutMs: number;

    /**
     * Creates a new TimeoutError.
     * @param timeoutMs - The deadline that elapsed.
     * @param message - Overrides the default message.
     */
    constructor(timeoutMs: number, message?: string) {
        super(message ?? `Operation timed out after ${timeoutMs}ms`);
        this.name = 'TimeoutError';
        this.timeoutMs = timeoutMs;
    }
}
