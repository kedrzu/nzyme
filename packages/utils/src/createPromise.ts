/**
 * A wrapper type that contains a Promise along with its resolve and reject functions.
 * @template T - The type of value the promise will resolve with
 */
export type PromiseWrapper<T> = ReturnType<typeof createPromise<T>>;

/**
 * Creates a promise with its resolve and reject functions exposed.
 * This is useful when you need to resolve or reject a promise from outside its executor.
 *
 * @template T - The type of value the promise will resolve with
 * @returns An object containing:
 *   - `promise`: The created Promise
 *   - `resolve`: Function to resolve the promise with a value of type T
 *   - `reject`: Function to reject the promise with an error
 *
 * @example
 * ```ts
 * const { promise, resolve, reject } = createPromise<string>();
 *
 * // Later...
 * resolve("Hello World");
 * // or
 * reject(new Error("Something went wrong"));
 * ```
 */
export function createPromise<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return {
        promise,
        resolve,
        reject,
    };
}
