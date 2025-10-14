/**
 * Creates a function that returns the input value unchanged.
 *
 * @template T - The type of the input value
 * @param value - The value to return
 * @returns A function that returns the input value unchanged
 * @__NO_SIDE_EFFECTS__
 */
export function createGetter<T>(value: T): () => T {
    return () => value;
}
