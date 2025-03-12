/**
 * Check if a value is a plain object.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value != null && Object.getPrototypeOf(value) === Object.prototype;
}
