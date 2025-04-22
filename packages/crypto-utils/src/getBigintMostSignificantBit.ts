const deBruijn = [
    0n,
    48n,
    -1n,
    -1n,
    31n,
    -1n,
    15n,
    51n,
    -1n,
    63n,
    5n,
    -1n,
    -1n,
    -1n,
    19n,
    -1n,
    23n,
    28n,
    -1n,
    -1n,
    -1n,
    40n,
    36n,
    46n,
    -1n,
    13n,
    -1n,
    -1n,
    -1n,
    34n,
    -1n,
    58n,
    -1n,
    60n,
    2n,
    43n,
    55n,
    -1n,
    -1n,
    -1n,
    50n,
    62n,
    4n,
    -1n,
    18n,
    27n,
    -1n,
    39n,
    45n,
    -1n,
    -1n,
    33n,
    57n,
    -1n,
    1n,
    54n,
    -1n,
    49n,
    -1n,
    17n,
    -1n,
    -1n,
    32n,
    -1n,
    53n,
    -1n,
    16n,
    -1n,
    -1n,
    52n,
    -1n,
    -1n,
    -1n,
    64n,
    6n,
    7n,
    8n,
    -1n,
    9n,
    -1n,
    -1n,
    -1n,
    20n,
    10n,
    -1n,
    -1n,
    24n,
    -1n,
    29n,
    -1n,
    -1n,
    21n,
    -1n,
    11n,
    -1n,
    -1n,
    41n,
    -1n,
    25n,
    37n,
    -1n,
    47n,
    -1n,
    30n,
    14n,
    -1n,
    -1n,
    -1n,
    -1n,
    22n,
    -1n,
    -1n,
    35n,
    12n,
    -1n,
    -1n,
    -1n,
    59n,
    42n,
    -1n,
    -1n,
    61n,
    3n,
    26n,
    38n,
    44n,
    -1n,
    56n,
];
const multiplicator = BigInt('0x6c04f118e9966f6b');

const b1 = 1n,
    b2 = 2n,
    b4 = 4n,
    b8 = 8n,
    b16 = 16n,
    b32 = 32n,
    b57 = 57n;

/**
 * Finds the position of the most significant bit (MSB) in a BigInt
 *
 * Uses a De Bruijn sequence algorithm for efficient bit scanning in bigint values.
 * This is useful for various cryptographic and mathematical operations.
 *
 * @param value - The BigInt value to analyze
 * @returns The position of the most significant bit (1-based indexing, returns 0 for value of 0)
 * @see https://stackoverflow.com/a/62110601/2202583
 */
export function getBigintMostSignificantBit(value: bigint) {
    value |= value >> b1;
    value |= value >> b2;
    value |= value >> b4;
    value |= value >> b8;
    value |= value >> b16;
    value |= value >> b32;
    return deBruijn[
        BigInt.asUintN(64, BigInt.asUintN(64, value * multiplicator) >> b57) as unknown as number
    ];
}

/**
 * Finds the position of the least significant bit (LSB) in a BigInt
 *
 * Uses a De Bruijn sequence algorithm for efficient bit scanning in bigint values.
 * This is useful for various cryptographic and mathematical operations.
 *
 * @param value - The BigInt value to analyze
 * @returns The position of the least significant bit (1-based indexing, returns 0 for value of 0)
 * @see https://stackoverflow.com/a/62110601/2202583
 */
export function getBigintLeastSignificantBit(value: bigint) {
    value = -value | value;
    return deBruijn[
        BigInt.asUintN(64, BigInt.asUintN(64, ~value * multiplicator) >> b57) as unknown as number
    ];
}
