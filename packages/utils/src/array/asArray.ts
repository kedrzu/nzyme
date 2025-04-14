/**
 * Converts a value to an array. If the value is already an array, it is returned as is.
 * If the value is null or undefined, an empty array is returned. Otherwise, the value
 * is wrapped in a single-element array.
 *
 * @template T - The type of elements in the array
 * @param o - The value to convert to an array
 * @returns An array containing the value(s)
 */
export function asArray<T>(o: null | readonly T[] | T | undefined): readonly T[] {
    if (o === null || o === undefined) {
        return [];
    }

    return Array.isArray(o) ? o : [o as T];
}
