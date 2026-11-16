import { expect, test } from 'bun:test';

import { parseLoggerLevel } from './parseLoggerLevel.js';

test('undefined and empty mean unset', () => {
    expect(parseLoggerLevel(undefined)).toBeUndefined();
    expect(parseLoggerLevel('')).toBeUndefined();
});

test('returns a valid level', () => {
    expect(parseLoggerLevel('debug')).toBe('debug');
});

test('the level name is case-insensitive', () => {
    expect(parseLoggerLevel('DEBUG')).toBe('debug');
    expect(parseLoggerLevel('Warn')).toBe('warn');
});

test('an invalid value throws listing the valid levels', () => {
    expect(() => parseLoggerLevel('verbose')).toThrow('Valid levels: trace, debug, info, warn, error.');
});
