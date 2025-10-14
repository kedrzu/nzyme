/**
 * Creates a deep copy of a value using JSON serialization.
 * Note that this method has limitations:
 * - Functions are not copied
 * - Symbols are not copied
 * - Circular references are not supported
 * - Special objects like Date, RegExp, etc. are converted to plain objects
 *
 * @template T - The type of the value to copy
 * @param value - The value to copy
 * @returns A deep copy of the value
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: { c: 2 } };
 * const copy = deepCopy(obj);
 *
 * console.log(copy.b === obj.b); // false
 * console.log(copy); // { a: 1, b: { c: 2 } }
 * ```
 */
export function deepCopy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
