/**
 * Converts parameter to an array
 * @param o an object, array, null or undefined
 * @return an array of 0, 1 or more elements
 */
export function asArray<T>(o: T | readonly T[] | undefined | null): readonly T[] {
    if (o === null || o === undefined) {
        return [];
    }

    return Array.isArray(o) ? o : [o as T];
}
