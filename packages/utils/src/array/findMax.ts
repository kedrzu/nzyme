/**
 * Finds the element in an iterable that has the maximum value according to a selector function.
 *
 * @template T - The type of elements in the iterable
 * @param array - The iterable to search
 * @param value - Function that extracts a numeric value from each element
 * @returns The element with the maximum value, or undefined if the iterable is empty
 * @__NO_SIDE_EFFECTS__
 */
export function findMax<T>(array: Iterable<T>, value: (item: T) => number) {
    let max: T | undefined;
    for (const item of array) {
        if (!max) {
            max = item;
        } else if (value(item) > value(max)) {
            max = item;
        }
    }

    return max;
}
