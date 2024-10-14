/** Pseudo random number generator based on https://stackoverflow.com/a/47593316/2202583 */
export function rngMulberry32(seed: number) {
    seed = seed | 0; // turn into a 32-bit integer
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
