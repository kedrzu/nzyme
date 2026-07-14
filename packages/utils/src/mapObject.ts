import type { ValueOf } from '@nzyme/types/Common.js';

/**
 * Creates a new object by mapping each property of the input object through a transformation function.
 * Only properties with defined values are processed.
 * @util
 *
 * @template T - The type of the input object
 * @template TTo - The type of the output object properties
 * @param obj - The object to map
 * @param map - Function that transforms each property value
 * @returns A new object with transformed properties
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2, c: 3 };
 * const doubled = mapObject(obj, (value, key) => value * 2);
 * // doubled = { a: 2, b: 4, c: 6 }
 * ```
 */
export function mapObject<T, TTo>(obj: T, map: (value: ValueOf<T>, key: keyof T, index: number) => TTo) {
    const result = {} as {
        [K in keyof T]: TTo;
    };
    let index = 0;
    for (const key in obj) {
        const value = obj[key];
        if (value !== undefined) {
            result[key] = map(value as ValueOf<T>, key, index);
        }

        index++;
    }

    return result;
}
