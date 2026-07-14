/**
 * Returns a random integer between min (inclusive) and max (exclusive).
 *
 * @util
 * @param min - The minimum value (inclusive).
 * @param max - The maximum value (exclusive).
 * @returns A random integer between min and max.
 */
export function randomInt(min: number = 0, max: number = Number.MAX_SAFE_INTEGER) {
    return Math.floor(Math.random() * (max - min)) + min;
}
