/**
 * Finds the element in an iterable that has the minimum value according to a selector function.
 *
 * @template T - The type of elements in the iterable
 * @param array - The iterable to search
 * @param value - Function that extracts a numeric value from each element
 * @returns The element with the minimum value, or undefined if the iterable is empty
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function findMin<T>(array: Iterable<T>, value: (item: T) => number) {
    let min: T | undefined;
    for (const item of array) {
        if (!min) {
            min = item;
        } else if (value(item) < value(min)) {
            min = item;
        }
    }

    return min;
}
