import type { DateTimeISO } from '@nzyme/types';

/**
 * Represents a type that has been converted to a JSON-serializable form.
 *
 * @template T - The original type
 *
 * Conversion rules:
 * - Date -> ISO string (DateTimeISO)
 * - bigint -> string representation
 * - Set<T> -> Array<Json<T>>
 * - Map<K, V> -> Array<[Json<K>, Json<V>]>
 * - Array<T> -> Array<Json<T>>
 * - object -> { [K in keyof T]: Json<T[K]> }
 * - Function -> never (functions cannot be serialized)
 * - primitives -> unchanged
 *
 * @__NO_SIDE_EFFECTS__
 */
export type Json<T> = T extends Date
    ? DateTimeISO
    : T extends bigint
      ? bigint | `${bigint}`
      : T extends Set<infer U>
        ? Array<Json<U>>
        : T extends Map<infer K, infer V>
          ? Array<[Json<K>, Json<V>]>
          : T extends Array<infer U>
            ? Array<Json<U>>
            : T extends object
              ? { [K in keyof T]: Json<T[K]> }
              : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                T extends Function
                ? never
                : T;

/**
 * Converts a value to a JSON string, with special handling for BigInt, Set, and Map types.
 * @template T - The type of the value to convert
 * @param value - The value to convert to JSON
 * @param space - Optional number or string to use for indentation
 * @returns A JSON string representation of the value
 * @throws {TypeError} If the value contains circular references
 */
export function toJsonString<T>(value: T, space?: number | string): string {
    if (value == null) {
        return 'null';
    }

    return JSON.stringify(value, serializeValue, space);
}

function serializeValue(_key: unknown, value: unknown) {
    switch (typeof value) {
        case 'bigint':
            return value.toString();
        case 'boolean':
        case 'number':
        case 'string':
        case 'undefined':
            return value;
        case 'function':
            return undefined;
    }

    if (value instanceof Set) {
        const result: unknown[] = [];
        for (const val of value) {
            result.push(val);
        }

        return result;
    }

    if (value instanceof Map) {
        const map = value as Map<unknown, unknown>;
        const result: [unknown, unknown][] = [];
        for (const [key, val] of map.entries()) {
            result.push([key, val]);
        }

        return result;
    }

    return value;
}
