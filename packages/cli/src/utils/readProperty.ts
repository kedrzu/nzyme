/**
 * Reads an own property of an `unknown` value, or `undefined` when the value is not an object or
 * lacks the key. Unlike `isPlainObject`, it accepts any object, a null-prototype module namespace
 * included.
 * @util
 */
export function readProperty(value: unknown, key: string): unknown {
    if (typeof value !== 'object' || value === null || !(key in value)) {
        return undefined;
    }

    return Object.getOwnPropertyDescriptor(value, key)?.value;
}
