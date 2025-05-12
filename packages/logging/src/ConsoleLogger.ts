import { callerName, defineService } from '@nzyme/ioc';
import { noop } from '@nzyme/utils';

import type { LoggerObject } from './Logger.js';
import { Logger } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';

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
        error: (msg: string, obj?: LoggerObject) => log(name, 'error', msg, obj),
        warn: (msg: string, obj?: LoggerObject) => log(name, 'warn', msg, obj),
        info: (msg: string, obj?: LoggerObject) => log(name, 'info', msg, obj),
        debug: (msg: string, obj?: LoggerObject) => log(name, 'debug', msg, obj),
        trace: (msg: string, obj?: LoggerObject) => log(name, 'trace', msg, obj),
        context: noop,
    }),
});

function log(name: string | undefined, level: Exclude<LoggerLevel, 'fatal'>, msg: string, obj?: LoggerObject) {
    if (name) {
        msg = `[${name}] ${msg}`;
    }

    if (obj) {
        console[level](msg, obj);
    } else {
        console[level](msg);
    }
}
