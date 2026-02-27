import type { SomeObject } from '@nzyme/types/Object.js';

/**
 * Returns an array of the object's own enumerable property names, properly typed.
 * This is a type-safe alternative to Object.keys().
 *
 * @template T - The type of the object
 * @param obj - The object whose enumerable properties are to be returned
 * @returns An array of strings representing the object's enumerable properties
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2 };
 * const keys = getObjectKeys(obj); // type: ('a' | 'b')[]
 * ```
 */
export function getObjectKeys<T extends SomeObject>(obj: T) {
    return Object.keys(obj) as (keyof T)[];
}
