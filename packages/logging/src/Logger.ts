import { defineInterface } from '@nzyme/ioc';

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
});
