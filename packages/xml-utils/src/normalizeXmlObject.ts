/**
 *
 */
export type MaybeXmlValue<T> = string | T | null;

/**
 *
 */
export function normalizeXmlObject<T>(value: MaybeXmlValue<T>) {
    if (!value || typeof value === 'string') {
        return null;
    }

    return value;
}
