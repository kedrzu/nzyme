/**
 * Returns the input value unchanged.
 *
 * @template T - The type of the input value
 * @param value - The value to return
 * @returns The input value unchanged
 */
// #__NO_SIDE_EFFECTS__
export function identity<T>(value: T) {
    return value;
}
