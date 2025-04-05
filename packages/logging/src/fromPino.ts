import type { LogFn, Logger as PinoLogger } from 'pino';

import type { Logger, LoggerObject } from './Logger.js';

/**
 * Wrap a Pino logger in a Logger instance.
 */
export function fromPino(pino: PinoLogger): Logger {
    return {
        error: (msg: string, obj?: LoggerObject) => log(pino.error, msg, obj),
        warn: (msg: string, obj?: LoggerObject) => log(pino.warn, msg, obj),
        info: (msg: string, obj?: LoggerObject) => log(pino.info, msg, obj),
        debug: (msg: string, obj?: LoggerObject) => log(pino.debug, msg, obj),
        trace: (msg: string, obj?: LoggerObject) => log(pino.trace, msg, obj),
        fatal: (msg: string, obj?: LoggerObject) => log(pino.fatal, msg, obj),
    };
}

function log(logFn: LogFn, msg: string, obj?: LoggerObject) {
    const error = obj?.error;
    if (error) {
        obj.err = error;
        obj.error = undefined;
    }

    logFn(obj, msg);
}
