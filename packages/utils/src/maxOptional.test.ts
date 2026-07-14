import { describe, expect, it } from 'bun:test';

import { maxOptional } from './maxOptional.js';

describe('maxOptional', () => {
    it('returns undefined when both are undefined', () => {
        expect(maxOptional(undefined, undefined)).toBeUndefined();
    });

    it('returns the defined value when the other is undefined', () => {
        expect(maxOptional(5, undefined)).toBe(5);
        expect(maxOptional(undefined, 7)).toBe(7);
    });

    it('returns the larger of two defined values', () => {
        expect(maxOptional(3, 9)).toBe(9);
        expect(maxOptional(9, 3)).toBe(9);
    });

    it('handles equal values', () => {
        expect(maxOptional(4, 4)).toBe(4);
    });

    it('treats 0 as a defined value, not a missing one', () => {
        expect(maxOptional(0, undefined)).toBe(0);
        expect(maxOptional(undefined, 0)).toBe(0);
        expect(maxOptional(0, -1)).toBe(0);
    });

    it('handles negative numbers', () => {
        expect(maxOptional(-5, -2)).toBe(-2);
    });
});
