/**
 * Safely parses a string into a BigInt value.
 * Returns null if the string cannot be parsed into a valid BigInt.
 * @util
 *
 * @param value - The string to parse into a BigInt
 * @returns The parsed BigInt value, or null if parsing fails
 *
 * @example
 * ```typescript
 * parseBigint('12345678901234567890'); // 12345678901234567890n
 * parseBigint('invalid'); // null
 * ```
 */
export function parseBigint(value: string): bigint | null {
    try {
        return BigInt(value);
    } catch {
        return null;
    }
}
