/**
 * Error thrown when an operation is canceled.
 * This is typically used in conjunction with {@link Cancelable} to signal that an operation was canceled.
 *
 * @example
 * ```typescript
 * try {
 *     await someCancelableOperation();
 * } catch (e) {
 *     if (e instanceof CancelError) {
 *         console.log('Operation was canceled');
 *     }
 * }
 * ```
 */
export class CancelError extends Error {
    /**
     * Creates a new CancelError.
     */
    constructor() {
        super('Operation was canceled');
        this.name = 'CancelError';
    }
}
