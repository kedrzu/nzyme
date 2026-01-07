import type { Json } from './toJsonString.js';

/**
 * Converts a value to its JSON-serializable form.
 *
 * This function performs deep conversion of complex types:
 * - Date objects are converted to ISO strings
 * - bigint values are converted to strings
 * - Set instances are converted to arrays
 * - Map instances are converted to arrays of key-value pairs (both keys and values are recursively converted)
 * - Arrays are mapped recursively
 * - Objects have their properties recursively converted
 * - Functions are converted to undefined
 * - null and undefined are both converted to null
 *
 * @template T - The type of the value to convert
 * @param value - The value to convert to JSON-serializable form
 * @returns A JSON-serializable representation of the value
 *
 * @example
 * ```ts
 * toJson(new Date('2024-01-01')) // '2024-01-01T00:00:00.000Z'
 * toJson(123n) // '123'
 * toJson(new Set([1, 2, 3])) // [1, 2, 3]
 * toJson(new Map([['key', 123n]])) // [['key', '123']]
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */

export function toJson<T>(value: T): Json<T> {
    if (value == null) {
        return null as Json<T>;
    }

    if (value instanceof Date) {
        return value.toISOString() as Json<T>;
    }

    if (Array.isArray(value)) {
        return value.map(toJson) as Json<T>;
    }

    if (value instanceof Set) {
        const result: unknown[] = [];
        for (const val of value) {
            result.push(toJson(val));
        }

        return result as Json<T>;
    }

    if (value instanceof Map) {
        const result: [unknown, unknown][] = [];
        for (const [key, val] of value.entries()) {
            result.push([toJson(key), toJson(val)]);
        }

        return result as Json<T>;
    }

    switch (typeof value) {
        case 'bigint':
            return value.toString() as Json<T>;
        case 'function':
            return undefined as Json<T>;
        case 'object': {
            const result: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
                result[key] = toJson(val);
            }

            return result as Json<T>;
        }
    }

    return value as Json<T>;
}
