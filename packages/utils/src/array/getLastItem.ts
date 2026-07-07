import type { Immutable } from '@nzyme/types/Immutable.js';

/**
 * Returns the last element of an array.
 *
 * @template T - The type of elements in the array
 * @param array - The array to get the last element from
 * @returns The last element of the array or undefined if the array is empty
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getLastItem<T>(array: Immutable<T[]>): Immutable<T> | undefined;
/**
 * Returns the last element of an array.
 *
 * @template T - The type of elements in the array
 * @param array - The array to get the last element from
 * @returns The last element of the array or undefined if the array is empty
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getLastItem<T>(array: T[]): T | undefined;
export function getLastItem<T>(array: Immutable<T[]>) {
    return array[array.length - 1];
}
