import { describe, expect, it } from 'bun:test';

import { getRotatedKeyWindows } from './RotatedSecret.js';

describe('getRotatedKeyWindows', () => {
    it('assigns the same windows to the same window', () => {
        expect(getRotatedKeyWindows(200, 6)).toEqual(getRotatedKeyWindows(200, 6));
    });

    it('holds the keyCount most recent windows, current included', () => {
        const windows = getRotatedKeyWindows(200, 6);

        expect(windows.toSorted((a, b) => a - b)).toEqual([195, 196, 197, 198, 199, 200]);
        expect(windows[200 % 6]).toBe(200);
    });

    it('keeps each window in the slot given by window mod keyCount', () => {
        for (const window of [6, 7, 11, 200]) {
            for (const [slot, slotWindow] of getRotatedKeyWindows(window, 6).entries()) {
                expect(slotWindow % 6).toBe(slot);
                expect(slotWindow).toBeLessThanOrEqual(window);
            }
        }
    });

    it('replaces exactly the oldest slot when the window flips', () => {
        for (const window of [6, 7, 199, 200]) {
            const before = getRotatedKeyWindows(window, 6);
            const after = getRotatedKeyWindows(window + 1, 6);

            const changed = before.flatMap((value, slot) => (value === after[slot] ? [] : [slot]));

            expect(changed).toEqual([(window + 1) % 6]);
            expect(after[(window + 1) % 6]).toBe(window + 1);
            expect(before[(window + 1) % 6]).toBe(window + 1 - 6);
        }
    });
});
