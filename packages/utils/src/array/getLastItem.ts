import type { Immutable } from '@nzyme/types';

/**
 * Returns the last element of an array.
 *
 * @template T - The type of elements in the array
 * @param array - The array to get the last element from
 * @returns The last element of the array
 * @throws Error if the array is empty
 * @__NO_SIDE_EFFECTS__
 */
export function getLastItem<T>(array: Immutable<T[]>) {
    if (!array.length) {
        throw new Error('Collection is empty');
    }

    return array[array.length - 1];
}
