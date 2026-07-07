/**
 * Finds the index of the first element in an array that satisfies a predicate.
 * @util
 *
 * @template T - The type of elements in the array
 * @param array - The array to search
 * @param predicate - Function that determines if an element should be found
 * @param fromIndex - The index to start searching from
 * @returns The index of the first element that satisfies the predicate, or -1 if no element satisfies the predicate
 */
export function findIndex<T>(array: readonly T[], predicate: (item: T) => boolean, fromIndex: number = 0) {
    for (let i = fromIndex; i < array.length; i++) {
        if (predicate(array[i]!)) {
            return i;
        }
    }

    return -1;
}
