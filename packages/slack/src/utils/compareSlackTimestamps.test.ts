import { describe, expect, test } from 'bun:test';

import { compareSlackTimestamps } from './compareSlackTimestamps.js';

describe('compareSlackTimestamps', () => {
    test('returns 0 for two identical timestamps', () => {
        expect(compareSlackTimestamps('1700000000.000100', '1700000000.000100')).toBe(0);
    });

    test('orders by the seconds part when it differs', () => {
        expect(compareSlackTimestamps('1700000000.999999', '1700000001.000000')).toBeLessThan(0);
        expect(compareSlackTimestamps('1700000001.000000', '1700000000.999999')).toBeGreaterThan(0);
    });

    test('orders by the microseconds part when the seconds match', () => {
        expect(compareSlackTimestamps('1700000000.000001', '1700000000.000002')).toBeLessThan(0);
        expect(compareSlackTimestamps('1700000000.000002', '1700000000.000001')).toBeGreaterThan(0);
    });

    // The whole reason this file exists: a shorter fractional part is NOT a smaller value. Comparing
    // these as strings gets it backwards ('204059' > '20406' as text), which would make a genuinely
    // later reply look like it arrived before the baseline and get silently dropped.
    test('compares fractional parts with different digit counts numerically, not as strings', () => {
        expect(compareSlackTimestamps('1789987660.204059', '1789987660.20406')).toBeLessThan(0);
        expect(compareSlackTimestamps('1789987660.20406', '1789987660.204059')).toBeGreaterThan(0);
    });

    test('treats a missing fractional part as .000000', () => {
        expect(compareSlackTimestamps('1700000000', '1700000000.000000')).toBe(0);
        expect(compareSlackTimestamps('1700000000', '1700000000.000001')).toBeLessThan(0);
    });
});
