import type { DefinedProperties } from '@nzyme/types/Properties.js';

/**
 * Removes properties that are undefined from an object.
 * Modifies the input object in place.
 * @util
 *
 * @deprecated Use {@link skipUndefinedProps} instead
 * @template T - The type of the object
 * @param obj - The object to remove undefined properties from
 * @returns The same object with undefined properties removed
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: undefined, c: 3 };
 * removeUndefinedProps(obj);
 * // obj = { a: 1, c: 3 }
 * ```
 */
export function removeUndefinedProps<T extends object>(obj: T): T {
    for (const prop in obj) {
        if (obj[prop] === undefined) {
            delete obj[prop];
        }
    }

    return obj;
}

/**
 * Creates a new object containing only the defined properties of the input object.
 * Does not modify the input object.
 * @util
 *
 * @template T - The type of the object
 * @param obj - The object to filter
 * @returns A new object containing only defined properties
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: undefined, c: 3 };
 * const filtered = skipUndefinedProps(obj);
 * // filtered = { a: 1, c: 3 }
 * // obj remains unchanged
 * ```
 */
export function skipUndefinedProps<T extends object>(obj: T): DefinedProperties<T> {
    const result = {} as Record<string, unknown>;

    for (const prop in obj) {
        if (obj[prop] !== undefined) {
            result[prop] = obj[prop];
        }
    }

    return result as DefinedProperties<T>;
}
