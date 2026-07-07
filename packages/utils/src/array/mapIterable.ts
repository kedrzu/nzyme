/**
 * Creates a new iterable by applying a mapping function to each element of the input iterable.
 * @util
 *
 * @template T1 - The type of elements in the input iterable
 * @template T2 - The type of elements in the output iterable
 * @param array - The input iterable to map over
 * @param map - The function to apply to each element
 * @yields The mapped elements one by one
 */
export function* mapIterable<T1, T2>(array: Iterable<T1>, map: (item: T1) => T2) {
    for (const item of array) {
        yield map(item);
    }
}
