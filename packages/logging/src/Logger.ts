import { callerName, defineService } from '@nzyme/ioc';

import { LoggerTransport } from './LoggerTransport.js';

/**
 * A logger instance.
 */
export interface Logger {
    /**
     * The name of the logger.
     */
    name: string | undefined;
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
     * Log context.
     */
    context: LoggerContextFunction;
}

/**
 * A logger function that sets a context value.
 */
export interface LoggerContextFunction {
    <T extends object>(name: string, ctx: T | null | undefined): void;
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
    error?: unknown;
    /**
     * Additional properties.
     */
    [key: string]: unknown;
}

/**
 * A logger interface.
 */
export const Logger = defineService({
    name: 'Logger',
    resolution: 'transient',
    deps: {
        name: callerName(),
        transport: LoggerTransport,
    },
    setup: ({ name, transport }) => {
        const logger: Logger = {
            name,
            error: (msg, obj) => transport.log(name, 'error', msg, obj),
            warn: (msg, obj) => transport.log(name, 'warn', msg, obj),
            info: (msg, obj) => transport.log(name, 'info', msg, obj),
            debug: (msg, obj) => transport.log(name, 'debug', msg, obj),
            trace: (msg, obj) => transport.log(name, 'trace', msg, obj),
            context: (ctxName, ctx) => transport.ctx(name, ctxName, ctx),
        };

        return logger;
    },
});
