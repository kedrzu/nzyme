/**
 * Calculates the sum of values extracted from each element of an iterable.
 * @util
 *
 * @template T1 - The type of elements in the input iterable
 * @param array - The iterable to sum over
 * @param value - Function that extracts a numeric value from each element
 * @returns The sum of all extracted values
 */
export function sumOver<T1>(array: Iterable<T1>, value: (item: T1) => number) {
    let sum = 0;
    for (const item of array) {
        sum += value(item);
    }

    return sum;
}
