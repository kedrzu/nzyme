import type { SomeObject } from '@nzyme/types';

/**
 * Returns an array of the object's own enumerable property key-value pairs, properly typed.
 * This is a type-safe alternative to Object.entries().
 *
 * @template T - The type of the object
 * @param object - The object whose enumerable properties are to be returned
 * @returns An array of key-value pairs
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2 };
 * const entries = getObjectEntries(obj); // type: [keyof typeof obj, number][]
 * ```
 * @__NO_SIDE_EFFECTS__
 */
export function getObjectEntries<T extends SomeObject>(object: T) {
    return Object.entries(object) as [keyof T, T[keyof T]][];
}
