import { defineInterface } from '@nzyme/ioc/Interface.js';
import { defineService } from '@nzyme/ioc/Service.js';

import type { LoggerObject } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';

/** A function that handles log output for a given logger, level, message, and optional data. */
export interface LoggerTransport {
    /** Writes a log entry to the transport destination. */
    (logger: string | undefined, level: LoggerLevel, message: string, obj?: LoggerObject | null): void;
}

/**
 * Log a message to the console.
 */
export const consoleLog: LoggerTransport = (
    logger: string | undefined,
    level: LoggerLevel,
    message: string,
    obj?: LoggerObject | null,
) => {
    if (logger) {
        message = `[${logger}] ${message}`;
    }

    if (obj) {
        console[level](message, obj);
    } else {
        console[level](message);
    }
};

/** Injectable interface for the logger transport, defaults to console logging. */
export const LoggerTransport = defineInterface<LoggerTransport>({
    name: 'LoggerTransport',
    default: () => consoleLog,
});

/**
 * A console logger transport.
 */
export const ConsoleLoggerTransport = defineService({
    name: 'ConsoleLoggerTransport',
    implements: LoggerTransport,
    setup: () => consoleLog,
});
