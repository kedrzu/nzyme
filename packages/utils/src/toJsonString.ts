/**
 * Converts a value to a JSON string, with special handling for BigInt, Set, and Map types.
 * @util
 * @param value - The value to convert to JSON
 * @param space - Optional number or string to use for indentation
 * @returns A JSON string representation of the value
 * @throws {TypeError} If the value contains circular references
 */
export function toJsonString(value: unknown, space?: number | string): string {
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
        default:
            break;
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
