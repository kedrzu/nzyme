/**
 * Creates a Map from an iterable by mapping each element to a key-value pair.
 *
 * @template T - The type of elements in the input iterable
 * @template K - The type of keys in the resulting Map
 * @template R - The type of values in the resulting Map (optional)
 * @param arr - The input iterable to transform
 * @param key - Function that extracts the key from each element
 * @param value - Optional function that transforms each element into a value
 * @returns A Map with keys and values derived from the input iterable
 */
export function mapToMap<T, K>(arr: Iterable<T>, key: (item: T) => K): Map<K, T>;
export function mapToMap<T, K, R>(
    arr: Iterable<T>,
    key: (item: T) => K,
    value: (item: T) => R,
): Map<K, R>;
export function mapToMap<T, K>(
    arr: Iterable<T>,
    key: (item: T) => K,
    value?: (item: T) => unknown,
) {
    const result = new Map<K, unknown>();

    if (value) {
        for (const item of arr) {
            result.set(key(item), value(item));
        }
    } else {
        for (const item of arr) {
            result.set(key(item), item);
        }
    }

    return result;
}
