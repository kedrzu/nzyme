import { timingSafeEqual } from 'node:crypto';

/**
 * Compares two strings using a timing-safe comparison method
 *
 * This function provides protection against timing attacks by ensuring
 * the comparison takes the same amount of time regardless of where the
 * difference occurs in the strings.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are identical, false otherwise
 */
export function stringEqualTimingSafe(a: string, b: string) {
    try {
        return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
        return false;
    }
}
