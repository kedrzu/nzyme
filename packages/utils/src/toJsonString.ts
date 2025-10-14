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

/**
 *
 */
export function toJson<T>(value: T): unknown {
    if (value == null) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map(toJson);
    }

    if (value instanceof Set) {
        const result: unknown[] = [];
        for (const val of value) {
            result.push(toJson(val));
        }

        return result;
    }

    if (value instanceof Map) {
        const result: [unknown, unknown][] = [];
        for (const [key, val] of value.entries()) {
            result.push([key, toJson(val)]);
        }

        return result;
    }

    switch (typeof value) {
        case 'bigint':
            return value.toString();
        case 'function':
            return undefined;
        case 'object': {
            const result: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
                result[key] = toJson(val);
            }

            return result;
        }
    }

    return value;
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
