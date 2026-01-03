/**
 * Prepends a prefix to a value with a separator, if the prefix is provided.
 *
 * @param value - The base value to prefix.
 * @param prefix - The optional prefix to prepend.
 * @param separator - The separator to use between prefix and value.
 * @returns The prefixed value if prefix is truthy, otherwise the original value.
 * @__NO_SIDE_EFFECTS__
 */
export function withPrefix(value: string, prefix: string | null | undefined, separator: string = ''): string {
    return prefix ? `${prefix}${separator}${value}` : value;
}
