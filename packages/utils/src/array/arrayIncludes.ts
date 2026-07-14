/**
 * Checks if an item is included in an array. This is a type guard function.
 * @util
 *
 * @template T - The type of elements in the array
 * @param array - The array to check
 * @param item - The item to check
 * @returns True if the item is included in the array, false otherwise
 */
export function arrayIncludes<T>(array: T[], item: unknown): item is T {
    return array.includes(item as T);
}
