/**
 * Checks if a value is a plain object (created by the Object constructor or with literal notation).
 * This excludes objects created by other constructors (like Date, Array, etc.) and null/undefined.
 * @util
 *
 * @param value - The value to check
 * @returns True if the value is a plain object, false otherwise
 *
 * @example
 * ```typescript
 * isPlainObject({}); // true
 * isPlainObject(new Date()); // false
 * isPlainObject([]); // false
 * isPlainObject(null); // false
 * ```
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value != null && Object.getPrototypeOf(value) === Object.prototype;
}
