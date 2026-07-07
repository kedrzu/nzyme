/**
 * Checks if a value is iterable by verifying if it has a Symbol.iterator method.
 * @util
 *
 * @param value - The value to check for iterability
 * @returns True if the value is iterable, false otherwise
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
    return value != null && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function';
}
