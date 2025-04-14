/**
 * Checks if a string represents a single digit character (0-9).
 *
 * @param c - The string to check
 * @returns True if the string is a single digit character, false otherwise
 */
// #__NO_SIDE_EFFECTS__
export function isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
}
