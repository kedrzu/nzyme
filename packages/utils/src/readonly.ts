/**
 * Creates a readonly version of a value.
 * This is a type-level operation that doesn't actually prevent modifications at runtime.
 * @util
 *
 * @template T - The type of the value to make readonly
 * @param value - The value to make readonly
 * @returns The same value, but with a readonly type
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2 };
 * const readonlyObj = readonly(obj);
 * // readonlyObj is typed as Readonly<typeof obj>
 * ```
 */
export function readonly<T>(value: T): Readonly<T> {
    return value;
}
