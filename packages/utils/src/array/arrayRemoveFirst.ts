/**
 * Removes and returns the first element from an array that satisfies a predicate.
 *
 * @template T - The type of elements in the array
 * @param array - The array to remove the element from
 * @param predicate - Function that determines if an element should be removed
 * @returns The removed element, or undefined if no element satisfied the predicate
 */
export function arrayRemoveFirst<T>(array: T[], predicate: (item: T) => boolean) {
    for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item !== undefined && predicate(item)) {
            array.splice(i, 1);
            return item;
        }
    }
}
