/**
 * The items of `side` that it moved relative to `base`: those common to both but outside a longest
 * common subsequence of the two, i.e. the fewest items whose moves explain the new order.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function findMovedItems(base: string[], side: string[]): Set<string> {
    const sideSet = new Set(side);
    const baseSet = new Set(base);
    const before = base.filter(item => sideSet.has(item));
    const after = side.filter(item => baseSet.has(item));

    if (before.length === after.length && before.every((item, position) => item === after[position])) {
        return new Set();
    }

    // length(i, j): the LCS length of before[i..] and after[j..].
    const width = after.length + 1;
    const lengths = new Uint32Array((before.length + 1) * width);
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            lengths[i * width + j] =
                before[i] === after[j] ? length(i + 1, j + 1) + 1 : Math.max(length(i + 1, j), length(i, j + 1));
        }
    }

    const moved = new Set(after);
    for (let i = 0, j = 0; i < before.length && j < after.length;) {
        const item = after[j];
        if (before[i] === item && item !== undefined) {
            moved.delete(item);
            i++;
            j++;
        } else if (length(i + 1, j) >= length(i, j + 1)) {
            i++;
        } else {
            j++;
        }
    }

    return moved;

    function length(i: number, j: number) {
        return lengths[i * width + j] ?? 0;
    }
}
