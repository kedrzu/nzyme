/**
 * Error thrown when an operation is cancelled.
 * This is typically used in conjunction with {@link Cancelable} to signal that an operation was cancelled.
 *
 * @example
 * ```typescript
 * try {
 *     await someCancelableOperation();
 * } catch (e) {
 *     if (e instanceof CancelError) {
 *         console.log('Operation was cancelled');
 *     }
 * }
 * ```
 */
export class CancelError extends Error {
    /**
     * Creates a new CancelError.
     */
    constructor() {
        super('Operation was cancelled');
        this.name = 'CancelError';
    }
}
