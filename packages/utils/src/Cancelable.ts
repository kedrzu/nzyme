/**
 * Interface for objects that can be cancelled.
 * When cancelled, the object should stop its operation and clean up any resources.
 *
 * @example
 * ```typescript
 * class MyOperation implements Cancelable {
 *     private timeout: NodeJS.Timeout;
 *
 *     constructor() {
 *         this.timeout = setTimeout(() => {}, 1000);
 *     }
 *
 *     cancel() {
 *         clearTimeout(this.timeout);
 *     }
 * }
 * ```
 */
export interface Cancelable {
    /** Cancels the operation and cleans up any resources */
    cancel(): void;
}

/**
 * A promise that can be cancelled.
 * Combines the standard Promise interface with the Cancelable interface.
 *
 * @template T - The type of value the promise resolves to
 * @example
 * ```typescript
 * const promise: CancelablePromise<string> = makePromiseCancelable(
 *     Promise.resolve("Hello"),
 *     () => console.log("Cancelled")
 * );
 * ```
 */
export type CancelablePromise<T> = Cancelable & Promise<T>;

/**
 * Type guard to check if a promise is cancelable.
 * Returns true if the promise has a cancel method.
 *
 * @template T - The type of value the promise resolves to
 * @param promise - The promise to check
 * @returns True if the promise is cancelable (has a cancel method), false otherwise
 *
 * @example
 * ```typescript
 * const promise = makePromiseCancelable(Promise.resolve(), () => {});
 * if (isCancelablePromise(promise)) {
 *     promise.cancel(); // TypeScript knows this is safe
 * }
 * ```
 */
export function isCancelablePromise<T>(promise: Promise<T>): promise is CancelablePromise<T> {
    return 'cancel' in promise;
}

/**
 * Makes a promise cancelable by adding a cancel method.
 * When cancelled, the cancel callback is called.
 * The original promise remains unchanged.
 *
 * @template T - The type of value the promise resolves to
 * @param promise - The promise to make cancelable
 * @param cancelCallback - Function to call when the promise is cancelled
 * @returns A cancelable version of the promise that includes a cancel method
 *
 * @example
 * ```typescript
 * const promise = new Promise(resolve => {
 *     const timeout = setTimeout(resolve, 1000);
 *     return () => clearTimeout(timeout);
 * });
 *
 * const cancelable = makePromiseCancelable(promise, () => {
 *     console.log('Cancelled');
 * });
 *
 * cancelable.cancel(); // Logs "Cancelled"
 * ```
 */
export function makePromiseCancelable<T>(promise: Promise<T>, cancelCallback: () => void) {
    const cancelable = promise as CancelablePromise<T>;
    cancelable.cancel = cancelCallback;
    return cancelable;
}
