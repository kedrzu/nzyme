/** Represents a value that may be a single XML element, an array, a raw string, or null. */
export type MaybeXmlArray<T> = string | T | T[] | null;

/**
 * Normalizes an ambiguous XML value into a consistent array of elements.
 * @util
 */
export function normalizeXmlArray<T>(value: MaybeXmlArray<T>): T[] {
    if (!value || typeof value === 'string') {
        return [];
    }

    if (Array.isArray(value)) {
        return value;
    }

    return [value];
}
