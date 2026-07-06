/**
 * Returns the greater of two optional numbers, treating `undefined` as "no value".
 *
 * Unlike `Math.max`, which coerces `undefined` to `NaN`, this returns the defined
 * operand when only one is present, and `undefined` only when both are absent.
 * Useful for reconciling an optional cached value against an optional pending one
 * (e.g. effective read-seq pointers) without leaking a sentinel default.
 *
 * @param a - First optional number.
 * @param b - Second optional number.
 * @returns The larger of the two, the single defined value, or `undefined` if both are undefined.
 * @__NO_SIDE_EFFECTS__
 */
export function maxOptional(a: number | undefined, b: number | undefined): number | undefined {
    if (a == null) {
        return b;
    }
    if (b == null) {
        return a;
    }
    return Math.max(a, b);
}
