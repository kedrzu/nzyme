/**
 * Returns the first element of an array if the input is an array, otherwise returns the input value.
 * @util
 *
 * @template T - The type of the value or array elements
 * @param item - The value or array to get a single item from
 * @returns The first element of the array if input is an array, otherwise the input value
 * @__NO_SIDE_EFFECTS__
 */
export function getSingleItem<T>(item: T | T[]) {
    if (Array.isArray(item)) {
        return item[0];
    }

    return item;
}
