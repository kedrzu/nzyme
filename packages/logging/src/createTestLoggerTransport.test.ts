import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { createTestLoggerTransport } from './createTestLoggerTransport.js';
import { resetProcessLoggerLevels } from './shouldLog.js';

const originalLogLevel = process.env.LOG_LEVEL;
let info: ReturnType<typeof spyOn<Console, 'info'>>;
let debug: ReturnType<typeof spyOn<Console, 'debug'>>;

beforeEach(() => {
    delete process.env.LOG_LEVEL;
    resetProcessLoggerLevels();
    info = spyOn(console, 'info').mockImplementation(() => {});
    debug = spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    info.mockRestore();
    debug.mockRestore();
    if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
    } else {
        process.env.LOG_LEVEL = originalLogLevel;
    }
    resetProcessLoggerLevels();
});

test('captures every log and forwards nothing when LOG_LEVEL is unset', () => {
    const { transport, logs } = createTestLoggerTransport();

    transport('test', 'debug', 'debug line');
    transport('test', 'info', 'info line');

    expect(logs).toHaveLength(2);
    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
});

test('forwards only the levels LOG_LEVEL enables, still capturing all', () => {
    process.env.LOG_LEVEL = 'info';
    const { transport, logs } = createTestLoggerTransport();

    transport('test', 'debug', 'debug line');
    transport('test', 'info', 'info line');

    expect(logs).toHaveLength(2);
    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
});
