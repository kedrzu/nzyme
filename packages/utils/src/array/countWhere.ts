/**
 * Counts the number of elements in an iterable that satisfy a predicate.
 * @util
 *
 * @template T1 - The type of elements in the iterable
 * @param array - The iterable to count elements from
 * @param predicate - Function that determines if an element should be counted
 * @returns The number of elements that satisfy the predicate
 */
export function countWhere<T1>(array: Iterable<T1>, predicate: (item: T1) => unknown) {
    let count = 0;
    for (const item of array) {
        if (predicate(item)) {
            count++;
        }
    }

    return count;
}
