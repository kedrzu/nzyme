/**
 * Groups array elements into a Map using a key function.
 *
 * @template T - The type of elements in the array
 * @template K - The type of keys used for grouping (string or number)
 * @param array - The array to group
 * @param key - A function that extracts the grouping key from each element
 * @returns A Map where keys are the grouping keys and values are arrays of elements
 */
// #__NO_SIDE_EFFECTS__
export function groupByToMap<T, K extends number | string>(
    array: readonly T[],
    key: (item: T) => K,
) {
    const result = new Map<K, T[]>();

    for (const item of array) {
        const groupKey = key(item);
        let group = result.get(groupKey);
        if (!group) {
            group = [];
            result.set(groupKey, group);
        }

        group.push(item);
    }

    return result;
}
