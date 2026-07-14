/**
 * Options for the withTimeout function.
 */
export interface WithTimeoutOptions {
    /**
     * The error to throw if the operation times out.
     */
    error?: () => Error;
}

/**
 * Wraps a promise with a timeout.
 * If the promise times out, the error is thrown.
 * @util
 * @param promise - The promise to wrap.
 * @param timeout - The timeout in milliseconds.
 * @param options - The options for the withTimeout function.
 * @returns The promise that resolves to the result of the original promise.
 */
export function withTimeout<T>(promise: Promise<T>, timeout: number, options: WithTimeoutOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(options.error?.() ?? new Error('Operation timed out'));
        }, timeout);

        promise
            .then(value => {
                clearTimeout(timeoutId);
                resolve(value);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                reject(error as Error);
            });
    });
}
