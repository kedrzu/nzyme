/**
 * Filters out null and undefined values from an array.
 *
 * @template T - The type of elements in the array
 * @param array - The array to filter
 * @returns A new array containing only the non-null and non-undefined elements
 * @__NO_SIDE_EFFECTS__
 */
export function filterNotNull<T>(array: readonly (T | null | undefined)[]): T[] {
    return array.filter(x => x != null);
}
