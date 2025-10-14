import { defineInterface, defineService } from '@nzyme/ioc';
import { noop } from '@nzyme/utils';

import type { LoggerObject } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';

/**
 *
 */
export interface LoggerTransport {
    /**
     *
     */
    log(logger: string | undefined, level: LoggerLevel, message: string, obj?: LoggerObject): void;
    /**
     *
     */
    ctx(logger: string | undefined, name: string, ctx: object | null | undefined): void;
}

const consoleLoggerTransport: LoggerTransport = {
    log: (logger, level, message, obj) => {
        if (logger) {
            message = `[${logger}] ${message}`;
        }

        if (obj) {
            console[level](message, obj);
        } else {
            console[level](message);
        }
    },
    ctx: noop,
};

/**
 *
 */
export const LoggerTransport = defineInterface<LoggerTransport>({
    name: 'LoggerTransport',
    default: () => consoleLoggerTransport,
});

/**
 * A console logger transport.
 */
export const ConsoleLoggerTransport = defineService({
    name: 'ConsoleLoggerTransport',
    implements: LoggerTransport,
    setup: () => consoleLoggerTransport,
});
