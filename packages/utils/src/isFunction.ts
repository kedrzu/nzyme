/**
 * Checks if a value is a function.
 * This is a type guard that narrows the type to Function.
 *
 * @param value - The value to check
 * @returns True if the value is a function, false otherwise
 *
 * @example
 * ```typescript
 * isFunction(() => {}); // true
 * isFunction(function() {}); // true
 * isFunction('not a function'); // false
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isFunction(value: unknown): value is Function {
    return typeof value === 'function';
}
