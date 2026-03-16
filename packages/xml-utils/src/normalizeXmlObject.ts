/** Represents a value that may be an XML element, a raw string, or null. */
export type MaybeXmlValue<T> = string | T | null;

/** Normalizes an ambiguous XML value, returning the element or null if it is a string or missing. */
export function normalizeXmlObject<T>(value: MaybeXmlValue<T>) {
    if (!value || typeof value === 'string') {
        return null;
    }

    return value;
}
