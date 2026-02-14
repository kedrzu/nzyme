/**
 * Options for customizing the sort behavior.
 */
export interface SortOptions {
    /** The order to sort in (ascending or descending) */
    order?: SortOrder | null;
    /** Whether to ignore case when comparing strings */
    ignoreCase?: boolean;
}

/**
 * The order in which to sort items.
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Sorts an array based on a value extracted from each item.
 * Supports sorting by strings (with case sensitivity options) and numbers.
 * Null/undefined values are sorted to the beginning.
 *
 * @template T - The type of items in the array
 * @param array - The array to sort
 * @param value - Function that extracts the value to sort by from each item
 * @param options - Optional sorting configuration
 * @returns The sorted array (mutates the input array)
 *
 * @example
 * ```typescript
 * const items = [
 *     { name: 'Bob', age: 30 },
 *     { name: 'Alice', age: 25 },
 *     { name: 'Charlie', age: 35 }
 * ];
 *
 * // Sort by name (case-insensitive)
 * sortBy(items, item => item.name, { ignoreCase: true });
 * // Result: [{ name: 'Alice'... }, { name: 'Bob'... }, { name: 'Charlie'... }]
 *
 * // Sort by age in descending order
 * sortBy(items, item => item.age, { order: 'desc' });
 * // Result: [{ name: 'Charlie'... }, { name: 'Bob'... }, { name: 'Alice'... }]
 * ```
 */
export function sortBy<T>(array: T[], value: (item: T) => unknown, options?: SortOptions) {
    const orderDesc = options?.order === 'desc';
    const ignoreCase = options?.ignoreCase || false;

    return array.sort((a, b) => {
        let first = value(orderDesc ? b : a);
        let second = value(orderDesc ? a : b);

        if (typeof first === 'string') {
            if (ignoreCase) {
                first = first.toLocaleLowerCase();
                second = String(second).toLocaleLowerCase();
            }

            return (first as string).localeCompare(second as string);
        } else if (first == second) {
            return 0;
        } else if (first == null) {
            return -1;
        } else if (second == null) {
            return 1;
        } else if ((first as number) < (second as number)) {
            return -1;
        }

        return 1;
    });
}
