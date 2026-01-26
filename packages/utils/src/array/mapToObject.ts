/**
 * Creates an object from an iterable by mapping each element to a key-value pair.
 *
 * @template T - The type of elements in the input iterable
 * @template K - The type of keys in the resulting object (must extend string)
 * @template R - The type of values in the resulting object (optional)
 * @param arr - The input iterable to transform
 * @param key - Function that extracts the key from each element
 * @param value - Optional function that transforms each element into a value
 * @returns An object with keys and values derived from the input iterable
 */
export function mapToObject<T, K extends string>(arr: Iterable<T>, key: (item: T) => K): Record<K, T>;
export function mapToObject<T, K extends string, R>(
    arr: Iterable<T>,
    key: (item: T) => K,
    value: (item: T) => R,
): Record<K, R>;
export function mapToObject<T, K extends string>(arr: Iterable<T>, key: (item: T) => K, value?: (item: T) => unknown) {
    const result = {} as Record<K, unknown>;

    if (value) {
        for (const item of arr) {
            result[key(item)] = value(item);
        }
    } else {
        for (const item of arr) {
            result[key(item)] = item;
        }
    }

    return result;
}
