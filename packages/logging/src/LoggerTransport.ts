import { defineInterface, defineService } from '@nzyme/ioc';

import type { LoggerObject } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';

/**
 *
 */
export interface LoggerTransport {
    /**
     *
     */
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

/**
 *
 */
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
