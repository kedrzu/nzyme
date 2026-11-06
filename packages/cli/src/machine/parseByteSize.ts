/** Bytes per binary unit, matched case-insensitively. */
const UNIT_BYTES = new Map([
    ['b', 1],
    ['kib', 1024],
    ['mib', 1024 ** 2],
    ['gib', 1024 ** 3],
    ['tib', 1024 ** 4],
]);

const BYTE_SIZE = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i;

/**
 * Parses a byte size written for a human — plain bytes (`1048576`) or a number with a binary unit
 * (`512MiB`, `1.5GiB`, `2 gib`) — into whole bytes. Returns `undefined` for anything else.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseByteSize(text: string): number | undefined {
    const match = BYTE_SIZE.exec(text.trim());
    if (!match) {
        return undefined;
    }

    const [, amount = '', unit = ''] = match;
    const multiplier = unit === '' ? 1 : UNIT_BYTES.get(unit.toLowerCase());
    if (multiplier === undefined) {
        return undefined;
    }

    return Math.round(Number(amount) * multiplier);
}
