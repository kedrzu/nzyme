/**
 * Joins two key segments with a dot separator, handling null/empty values.
 * @util
 */
export function concatKeys(
    first: number | string | null | undefined,
    second: number | string | null | undefined,
): string {
    if (second == null || second === '') {
        return String(first);
    }

    if (first == null || first === '') {
        return String(second);
    }

    return `${first}.${second}`;
}
