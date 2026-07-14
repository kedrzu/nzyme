/**
 * Numeric characters (0-9)
 */
export const CHARS_NUMBERS = '0123456789';

/**
 * Lowercase alphabetic characters (a-z)
 */
export const CHARS_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Uppercase alphabetic characters (A-Z)
 */
export const CHARS_UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * All alphabetic characters (a-z, A-Z)
 */
export const CHARS_LETTERS = CHARS_LOWERCASE + CHARS_UPPERCASE;

/**
 * Base36 character set (0-9, a-z)
 */
export const CHARS_BASE36 = CHARS_NUMBERS + CHARS_LOWERCASE;

/**
 * Generates a random string of specified length using provided character set
 *
 * @util
 * @param length - The length of the random string to generate
 * @param characters - Character set to use for generating the random string (defaults to Base36)
 * @returns A random string of the specified length
 */
export function randomString(length: number, characters: string = CHARS_BASE36) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
