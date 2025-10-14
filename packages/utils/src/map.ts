/**
 * Maps a value to a new value using a mapping function.
 *
 * @template T - The type of the input value
 * @template R - The type of the output value
 * @param value - The input value to map
 * @param mapFn - The mapping function to apply to the input value
 * @returns The mapped value
 * @__NO_SIDE_EFFECTS__
 */
export function map<T, R>(value: T, mapFn: (value: T) => R) {
    return mapFn(value);
}
