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

    return JSON.stringify(
        value,
        (_key, value: unknown) => {
            if (typeof value === 'bigint') {
                return value.toString();
            }

            if (value instanceof Set) {
                const result: unknown[] = [];
                for (const val of value) {
                    result.push(val);
                }

                return result;
            }

            if (value instanceof Map) {
                const map = value as Map<string, unknown>;
                const result: Record<string, unknown> = {};
                for (const [key, val] of map.entries()) {
                    result[key] = val;
                }

                return result;
            }

            return value;
        },
        space,
    );
}
