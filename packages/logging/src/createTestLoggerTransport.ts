import type { LoggerObject } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';
import { consoleLog } from './LoggerTransport.js';
import type { LoggerTransport } from './LoggerTransport.js';

/** A log entry captured during test execution. */
export interface CapturedLog {
    /** Name of the logger that produced this entry. */
    readonly logger: string | undefined;
    /** Severity level of the log entry. */
    readonly level: LoggerLevel;
    /** Log message text. */
    readonly message: string;
    /** Optional structured data attached to the log entry. */
    readonly data?: LoggerObject | null;
}

/** Result of creating a test logger transport. */
export interface TestLoggerTransportResult {
    /** Transport that records every log entry into {@link logs}. */
    transport: LoggerTransport;
    /** Log entries captured by the transport, in order. */
    logs: CapturedLog[];
}

/**
 * Create a {@link LoggerTransport} suitable for tests — captures every log entry into an array
 * and, when `process.env.LOGGING === 'true'`, also forwards it to the console for debugging.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createTestLoggerTransport(): TestLoggerTransportResult {
    const enabled = process.env.LOGGING === 'true';
    const logs: CapturedLog[] = [];

    const transport: LoggerTransport = (logger, level, message, obj) => {
        logs.push({ logger, level, message, data: obj });

        if (enabled) {
            consoleLog(logger, level, message, obj);
        }
    };

    return { transport, logs };
}
