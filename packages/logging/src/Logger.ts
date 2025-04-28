import { callerName, defineInterface, defineService } from '@nzyme/ioc';
import { noop } from '@nzyme/utils';

import type { LoggerLevel } from './LoggerLevel.js';

/**
 * A logger instance.
 */
export interface Logger {
    /**
     * Log an error.
     */
    error: LoggerLogFunction;
    /**
     * Log a warning.
     */
    warn: LoggerLogFunction;
    /**
     * Log an info message.
     */
    info: LoggerLogFunction;
    /**
     * Log a debug message.
     */
    debug: LoggerLogFunction;
    /**
     * Log a trace message.
     */
    trace: LoggerLogFunction;
    /**
     * Log a fatal message.
     */
    fatal: LoggerLogFunction;
    /**
     * Log context.
     */
    context: LoggerContextFunction;
}

/**
 * A logger function that sets a context value.
 */
export interface LoggerContextFunction {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T extends Record<string, any>>(name: string, ctx: T | null | undefined): void;
}

/**
 * A logger function.
 */
export interface LoggerLogFunction {
    (msg: string, obj?: LoggerObject): void;
}

/**
 * A logger object.
 */
export interface LoggerObject {
    /**
     * An error object.
     */
    err?: unknown;
    /**
     * An error object.
     */
    error?: unknown;
    /**
     * Additional properties.
     */
    [key: string]: unknown;
}

/**
 * A logger interface.
 */
export const Logger = defineInterface<Logger>({
    name: 'Logger',
    default: (container, caller): Logger => ConsoleLogger.resolve(container, caller),
});

/**
 * A console logger service.
 */
export const ConsoleLogger = defineService({
    name: 'ConsoleLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
    },
    setup: ({ name }) => ({
        error: (msg: string, obj?: LoggerObject) => logConsole(name, 'error', msg, obj),
        warn: (msg: string, obj?: LoggerObject) => logConsole(name, 'warn', msg, obj),
        info: (msg: string, obj?: LoggerObject) => logConsole(name, 'info', msg, obj),
        debug: (msg: string, obj?: LoggerObject) => logConsole(name, 'debug', msg, obj),
        trace: (msg: string, obj?: LoggerObject) => logConsole(name, 'trace', msg, obj),
        fatal: (msg: string, obj?: LoggerObject) => logConsole(name, 'error', msg, obj),
        context: noop,
    }),
});

function logConsole(
    name: string | undefined,
    level: Exclude<LoggerLevel, 'fatal'>,
    msg: string,
    obj?: LoggerObject,
) {
    if (name) {
        msg = `[${name}] ${msg}`;
    }

    if (obj) {
        console[level](msg, obj);
    } else {
        console[level](msg);
    }
}
