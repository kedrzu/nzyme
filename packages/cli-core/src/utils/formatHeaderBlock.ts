/**
 * A `key: value` header block, one line per field and newline-terminated. Empty values are left out
 * and line breaks inside a value become spaces, so a header can never forge another line.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatHeaderBlock(fields: [string, string][]): string {
    return fields
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${value.replace(/\s*[\r\n]+\s*/g, ' ')}\n`)
        .join('');
}
