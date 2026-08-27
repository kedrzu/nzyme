/**
 * Finds and removes the first element from an array that satisfies a predicate.
 * @util
 *
 * @template T - The type of elements in the array
 * @param array - The array to search and remove from
 * @param predicate - Function that determines if an element should be removed
 * @returns The removed element, or undefined if no element satisfied the predicate
 */
export function findAndRemove<T>(array: T[], predicate: (item: T) => boolean): T | undefined {
    const index = array.findIndex(predicate);
    if (index < 0) {
        return undefined;
    }

    return array.splice(index, 1)[0];
}
