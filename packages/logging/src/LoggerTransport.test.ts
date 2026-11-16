import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { consoleLog } from './LoggerTransport.js';
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

test('prints every level when LOG_LEVEL is unset', () => {
    consoleLog('test', 'debug', 'debug line');
    consoleLog('test', 'info', 'info line');

    expect(debug).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
});

test('prints only the levels LOG_LEVEL enables', () => {
    process.env.LOG_LEVEL = 'info';

    consoleLog('test', 'debug', 'debug line');
    consoleLog('test', 'info', 'info line');

    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
});
