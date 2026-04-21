import type { CapturedLog } from './createTestLoggerTransport.js';
import { createTestLoggerTransport } from './createTestLoggerTransport.js';
import type { Logger, LoggerObject } from './Logger.js';

/** Result of creating a test logger, providing the logger and captured logs. */
export interface TestLoggerResult {
    /** Logger instance backed by the test transport. */
    logger: Logger;
    /** Log entries captured by the underlying transport, in order. */
    logs: CapturedLog[];
}

/**
 * Create a {@link Logger} backed by a test transport. Log entries are captured into the returned
 * `logs` array and also forwarded to the console when `process.env.LOGGING === 'true'`.
 *
 * @param name - Name assigned to the logger and emitted with every entry.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createTestLogger(name: string): TestLoggerResult {
    const { transport, logs } = createTestLoggerTransport();

    const logger: Logger = {
        name,
        error: (msg: string, obj?: LoggerObject) => transport(name, 'error', msg, obj),
        warn: (msg: string, obj?: LoggerObject) => transport(name, 'warn', msg, obj),
        info: (msg: string, obj?: LoggerObject) => transport(name, 'info', msg, obj),
        debug: (msg: string, obj?: LoggerObject) => transport(name, 'debug', msg, obj),
        trace: (msg: string, obj?: LoggerObject) => transport(name, 'trace', msg, obj),
    };

    return { logger, logs };
}
