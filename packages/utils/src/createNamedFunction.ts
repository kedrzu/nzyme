/**
 * Creates a function with a specific name.
 * This is useful for debugging and stack traces, as the function will appear with the given name.
 *
 * @template F - The type of the function to create
 * @param name - The name to give the function
 * @param body - The function implementation
 * @returns A new function with the given name and implementation
 *
 * @example
 * ```typescript
 * const add = createNamedFunction('add', (a: number, b: number) => a + b);
 * console.log(add.name); // 'add'
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNamedFunction<F extends (...args: any[]) => any>(name: string, body: F): F {
    const fn = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [name](...args: any[]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return body.apply(this, args);
        },
    }[name] as F;

    return fn;
}
