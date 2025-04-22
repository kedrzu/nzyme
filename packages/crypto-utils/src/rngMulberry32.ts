/**
 * Creates a seeded pseudo-random number generator using the Mulberry32 algorithm
 *
 * This is a simple, fast generator with good statistical properties.
 * It can be used when deterministic random sequences are needed.
 *
 * @param seed - A 32-bit integer seed value to initialize the generator
 * @returns A function that returns a pseudo-random number between 0 and 1 when called
 * @see https://stackoverflow.com/a/47593316/2202583
 */
export function rngMulberry32(seed: number) {
    seed = seed | 0; // turn into a 32-bit integer
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
