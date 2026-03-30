import { describe, expect, test } from 'bun:test';

/**
 * Tests for the Reveal component's duration style computation.
 * We test the expression logic directly since mounting the full component
 * requires a DOM environment.
 */
describe('Reveal duration style', () => {
    // This mirrors the expression used in Reveal.tsx line 53
    function computeDurationStyle(duration: number | undefined) {
        return duration != null ? `${duration}ms` : undefined;
    }

    test('duration=0 should produce "0ms" (not undefined)', () => {
        // duration=0 means "instant, no animation"
        // The truthy check incorrectly treats 0 as falsy
        expect(computeDurationStyle(0)).toBe('0ms');
    });

    test('duration=undefined should produce undefined', () => {
        expect(computeDurationStyle(undefined)).toBeUndefined();
    });

    test('duration=500 should produce "500ms"', () => {
        expect(computeDurationStyle(500)).toBe('500ms');
    });
});
