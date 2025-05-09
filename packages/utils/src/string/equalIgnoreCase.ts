/**
 * Compares two strings for equality, ignoring case differences.
 *
 * @param a - The first string to compare
 * @param b - The second string to compare
 * @returns True if the strings are equal ignoring case, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
export function equalIgnoreCase(a: string, b: string) {
    return a.toLowerCase() === b.toLowerCase();
}

export { equalIgnoreCase as equalCaseInsensitive };
