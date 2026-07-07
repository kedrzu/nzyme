/**
 * Type representing the result of resolving all promises in an object.
 * @template T - The type of the object containing promises
 * @private
 */
type PromiseObjectResult<T> = Promise<{
    [K in keyof T]: Awaited<T[K]>;
}>;

/**
 * Works like `Promise.all` but for objects instead of arrays.
 * Resolves all promises in an object and returns a new object with the resolved values.
 * @util
 *
 * @template T - The type of the object containing promises
 * @param promises - An object containing promises to resolve
 * @returns A promise that resolves to an object with all promises resolved
 *
 * @example
 * ```typescript
 * const result = await promiseAll({
 *     user: fetchUser(),
 *     posts: fetchPosts(),
 *     comments: fetchComments()
 * });
 * // result = { user: User, posts: Post[], comments: Comment[] }
 * ```
 */
export async function promiseAll<T>(promises: T) {
    const result: Record<string, unknown> = {};

    for (const key in promises) {
        const promise = promises[key] as Promise<unknown>;
        result[key] = await promise;
    }

    return result as unknown as PromiseObjectResult<T>;
}
