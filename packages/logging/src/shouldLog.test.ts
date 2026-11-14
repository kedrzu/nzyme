import { afterEach, beforeEach, expect, test } from 'bun:test';

import { getProcessLoggerLevels, resetProcessLoggerLevels, shouldLog } from './shouldLog.js';

const originalLogLevel = process.env.LOG_LEVEL;

beforeEach(() => {
    delete process.env.LOG_LEVEL;
    resetProcessLoggerLevels();
});

afterEach(() => {
    if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
    } else {
        process.env.LOG_LEVEL = originalLogLevel;
    }
    resetProcessLoggerLevels();
});

test('unset LOG_LEVEL uses the fallback', () => {
    expect(shouldLog('debug', { fallback: 'info' })).toBe(false);
    expect(shouldLog('info', { fallback: 'info' })).toBe(true);
    expect(shouldLog('trace', { fallback: 'none' })).toBe(false);
});

test('empty LOG_LEVEL means unset', () => {
    process.env.LOG_LEVEL = '';

    expect(shouldLog('debug', { fallback: 'info' })).toBe(false);
});

test('a set LOG_LEVEL overrides the fallback', () => {
    process.env.LOG_LEVEL = 'debug';

    expect(shouldLog('debug', { fallback: 'info' })).toBe(true);
    expect(shouldLog('trace', { fallback: 'info' })).toBe(false);
    expect(shouldLog('trace', { fallback: 'none' })).toBe(false);
    expect(shouldLog('debug', { fallback: 'none' })).toBe(true);
});

test('an invalid LOG_LEVEL throws listing the levels', () => {
    process.env.LOG_LEVEL = 'verbose';

    expect(() => shouldLog('info', { fallback: 'info' })).toThrow('trace, debug, info, warn, error');
});

test('returns the same memoized map per fallback', () => {
    expect(getProcessLoggerLevels({ fallback: 'info' })).toBe(getProcessLoggerLevels({ fallback: 'info' }));
});

test('reads as unset when process does not exist, as in a browser', () => {
    const { process: originalProcess } = globalThis;
    process.env.LOG_LEVEL = 'error';
    // @ts-expect-error simulating a browser, where there is no `process`
    delete globalThis.process;

    let result: boolean;
    try {
        result = shouldLog('debug', { fallback: 'trace' });
    } finally {
        globalThis.process = originalProcess;
    }

    expect(result).toBe(true);
});
