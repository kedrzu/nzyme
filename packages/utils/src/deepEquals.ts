import isEqual from 'fast-deep-equal';

/**
 * Performs a deep equality comparison between two values.
 * Uses lodash's isEqual function for comprehensive comparison.
 * Handles arrays, objects, dates, and other complex types.
 * @util
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if the values are deeply equal, false otherwise
 *
 * @example
 * ```typescript
 * const a = { x: 1, y: { z: 2 } };
 * const b = { x: 1, y: { z: 2 } };
 * const c = { x: 1, y: { z: 3 } };
 *
 * console.log(deepEquals(a, b)); // true
 * console.log(deepEquals(a, c)); // false
 * ```
 */
export function deepEquals(a: unknown, b: unknown) {
    return isEqual(a, b);
}
