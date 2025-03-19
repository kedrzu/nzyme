import { pino } from 'pino';

import { callerName, defineInjectable, defineInterface, defineService } from '@nzyme/ioc';

import { fromPino } from './fromPino.js';

/**
 * A logger function.
 */
export interface LoggerFunction {
    (msg: string, obj?: object): void;
}

/**
 * A logger instance.
 */
export interface Logger {
    /**
     * Log an error.
     */
    error: LoggerFunction;
    /**
     * Log a warning.
     */
    warn: LoggerFunction;
    /**
     * Log an info message.
     */
    info: LoggerFunction;
    /**
     * Log a debug message.
     */
    debug: LoggerFunction;
    /**
     * Log a trace message.
     */
    trace: LoggerFunction;
    /**
     * Log a fatal message.
     */
    fatal: LoggerFunction;
}

/**
 * A logger interface.
 */
export const Logger = defineInterface<Logger>({
    name: 'Logger',
    default: defineInjectable({
        resolve: (container, caller): Logger => {
            return DefaultLogger.resolve(container, caller);
        },
    }),
});

/**
 * A default logger service.
 */
export const DefaultLogger = defineService({
    name: 'DefaultLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
    },
    setup: ({ name }) => fromPino(pino({ name })),
});
