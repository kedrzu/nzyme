/**
 * Removes duplicates from an array based on a key function.
 *
 * @template T - The type of elements in the array
 * @param array - The array to remove duplicates from
 * @param key - Function that extracts the key from each element
 * @returns The same array with duplicates removed
 */
export function arrayRemoveDuplicates<T>(array: T[], key: (item: T) => unknown): T[] {
    const seen = new Set<unknown>();

    for (let i = 0; i < array.length; i++) {
        const item = array[i]!;
        const itemKey = key(item);

        if (seen.has(itemKey)) {
            array.splice(i, 1);
            i--;
            continue;
        }

        seen.add(itemKey);
    }

    return array;
}
