/**
 * Groups elements of an array by a key derived from each element.
 * @util
 *
 * @template T - The type of elements in the array
 * @template K - The type of the grouping key (must be number or string)
 * @param array - The array to group
 * @param key - Function that extracts the grouping key from each element
 * @returns An object where keys are the grouping keys and values are arrays of elements
 * @__NO_SIDE_EFFECTS__
 */
export function groupBy<T, K extends number | string>(array: readonly T[], key: (item: T) => K) {
    const result = {} as Record<K, T[] | undefined>;

    for (const item of array) {
        const groupKey = key(item);
        let group = result[groupKey];
        if (!group) {
            result[groupKey] = group = [];
        }

        group.push(item);
    }

    return result;
}
