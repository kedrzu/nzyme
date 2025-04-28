import type { Logger as PinoLogger } from 'pino';

import { noop } from '@nzyme/utils';

import type { Logger, LoggerObject } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';

/**
 * Wrap a Pino logger in a Logger instance.
 */
export function fromPino(pino: PinoLogger): Logger {
    return {
        error: (msg: string, obj?: LoggerObject) => logPino(pino, 'error', msg, obj),
        warn: (msg: string, obj?: LoggerObject) => logPino(pino, 'warn', msg, obj),
        info: (msg: string, obj?: LoggerObject) => logPino(pino, 'info', msg, obj),
        debug: (msg: string, obj?: LoggerObject) => logPino(pino, 'debug', msg, obj),
        trace: (msg: string, obj?: LoggerObject) => logPino(pino, 'trace', msg, obj),
        fatal: (msg: string, obj?: LoggerObject) => logPino(pino, 'fatal', msg, obj),
        context: noop,
    };
}

/**
 * Log a message using a Pino logger.
 */
export function logPino(logger: PinoLogger, level: LoggerLevel, msg: string, obj?: LoggerObject) {
    const error = obj?.error;
    if (error) {
        obj.err = error;
        obj.error = undefined;
    }

    logger[level](obj, msg);
}
