/**
 * Generates a random floating-point number within a specified range
 *
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (exclusive)
 * @returns A random number between min (inclusive) and max (exclusive)
 */
export function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
}
