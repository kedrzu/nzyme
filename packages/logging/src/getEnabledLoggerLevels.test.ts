import { expect, test } from 'bun:test';

import { getEnabledLoggerLevels } from './getEnabledLoggerLevels.js';

test('a threshold enables its level and every more severe one', () => {
    expect(getEnabledLoggerLevels('trace')).toEqual({ trace: true, debug: true, info: true, warn: true, error: true });
    expect(getEnabledLoggerLevels('info')).toEqual({ trace: false, debug: false, info: true, warn: true, error: true });
    expect(getEnabledLoggerLevels('error')).toEqual({
        trace: false,
        debug: false,
        info: false,
        warn: false,
        error: true,
    });
});

test('none enables nothing', () => {
    expect(Object.values(getEnabledLoggerLevels('none'))).toEqual([false, false, false, false, false]);
});

test('returns the same frozen map on every call', () => {
    const enabled = getEnabledLoggerLevels('debug');

    expect(getEnabledLoggerLevels('debug')).toBe(enabled);
    expect(Object.isFrozen(enabled)).toBe(true);
});
