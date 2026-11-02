import { expect, test } from 'bun:test';

import { parseByteSize } from './parseByteSize.js';

test('reads plain bytes and binary units, case-insensitively', () => {
    expect(parseByteSize('1048576')).toBe(1024 ** 2);
    expect(parseByteSize('512MiB')).toBe(512 * 1024 ** 2);
    expect(parseByteSize('1.5GiB')).toBe(1.5 * 1024 ** 3);
    expect(parseByteSize('2 gib')).toBe(2 * 1024 ** 3);
    expect(parseByteSize('0')).toBe(0);
});

test('rejects anything that is not a non-negative size', () => {
    for (const text of ['', 'GiB', '-1GiB', '2GB', '2 GiB extra', '1e9']) {
        expect(parseByteSize(text)).toBeUndefined();
    }
});
