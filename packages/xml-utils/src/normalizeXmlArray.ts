/**
 *
 */
export type MaybeXmlArray<T> = string | T | T[] | null;

/**
 *
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
