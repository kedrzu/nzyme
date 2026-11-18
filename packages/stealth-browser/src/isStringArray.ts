/**
 * Whether `value` is an array of strings only, e.g. a list read from untrusted JSON.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}
