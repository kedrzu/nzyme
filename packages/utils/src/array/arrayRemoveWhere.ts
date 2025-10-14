/**
 * Removes all elements from an array that satisfy a predicate.
 *
 * @template T - The type of elements in the array
 * @param array - The array to remove elements from
 * @param predicate - Function that determines if an element should be removed
 * @returns The number of elements removed
 */
export function arrayRemoveWhere<T>(array: T[], predicate: (item: T) => boolean) {
    let count = 0;
    for (let i = 0; i < array.length; i++) {
        if (predicate(array[i]!)) {
            array.splice(i, 1);
            i--;
            count++;
        }
    }

    return count;
}
