/**
 * Removes the first occurrence of an item from an array.
 * @util
 *
 * @template T - The type of elements in the array
 * @param array - The array to remove the item from
 * @param item - The item to remove
 * @returns True if the item was found and removed, false otherwise
 */
export function arrayRemove<T>(array: T[], item: T) {
    const index = array.indexOf(item);
    if (index < 0) {
        return false;
    }

    array.splice(index, 1);
    return true;
}
