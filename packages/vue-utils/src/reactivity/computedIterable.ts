import { computed } from 'vue';
import type { ComputedRef } from 'vue';

/**
 * Creates a computed ref that returns an array of the elements of the iterable.
 *
 * @template T - The type of elements in the iterable
 * @param source - The function that returns the iterable
 * @returns A computed ref that returns an array of the elements of the iterable
 */
export function computedIterable<T>(source: () => Iterable<T>): ComputedRef<readonly T[]> {
    return computed(() => Array.from(source()));
}
