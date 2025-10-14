/**
 * Maps elements of an iterable to a new array, filtering out null and undefined values.
 *
 * @template T1 - The type of elements in the input iterable
 * @template T2 - The type of elements in the output array
 * @param array - The input iterable to map over
 * @param map - The function to apply to each element, which may return null or undefined
 * @returns An array containing only the non-null mapped values
 */
export function mapNotNull<T1, T2>(
    array: Iterable<T1>,
    map: (item: T1, index: number) => null | T2 | undefined,
) {
    const result: T2[] = [];

    let i = 0;
    for (const item of array) {
        const mapped = map(item, i++);
        if (mapped != null) {
            result.push(mapped);
        }
    }

    return result;
}
