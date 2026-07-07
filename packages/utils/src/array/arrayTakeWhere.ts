/**
 * Removes elements from an array that match a predicate and returns them in a new array.
 * @util
 *
 * @template T - The type of elements in the array
 * @param array - The array to take elements from
 * @param predicate - Function that determines which elements to take
 * @returns A new array containing the taken elements
 */
export function arrayTakeWhere<T>(array: T[], predicate: (item: T) => boolean) {
    const items: T[] = [];
    for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item !== undefined && predicate(item)) {
            array.splice(i, 1);
            i--;
            items.push(item);
        }
    }

    return items;
}
