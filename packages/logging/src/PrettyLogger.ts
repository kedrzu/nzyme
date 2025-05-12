import chalk from 'chalk';

import { callerName, defineService } from '@nzyme/ioc';
import { noop } from '@nzyme/utils';

import type { LoggerObject } from './Logger.js';
import { Logger } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';

let i = 0;
const colors = [chalk.red, chalk.yellow, chalk.green, chalk.blue, chalk.magenta, chalk.cyan];

/**
 * A console logger service.
 */
export const PrettyLogger = defineService({
    name: 'PrettyLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
    },
    setup: ({ name }) => {
        const color = colors[i++ % colors.length]!;

        return {
            error: (msg: string, obj?: LoggerObject) => log(name, color, 'error', msg, obj),
            warn: (msg: string, obj?: LoggerObject) => log(name, color, 'warn', msg, obj),
            info: (msg: string, obj?: LoggerObject) => log(name, color, 'info', msg, obj),
            debug: (msg: string, obj?: LoggerObject) => log(name, color, 'debug', msg, obj),
            trace: (msg: string, obj?: LoggerObject) => log(name, color, 'trace', msg, obj),
            fatal: (msg: string, obj?: LoggerObject) => log(name, color, 'error', msg, obj),
            context: noop,
        };
    },
});

function log(
    name: string | undefined,
    color: (msg: string) => string,
    level: Exclude<LoggerLevel, 'fatal'>,
    msg: string,
    obj?: LoggerObject,
) {
    if (name) {
        msg = `${color(`[${name}]`)} ${msg}`;
    }

    if (obj) {
        console[level](msg, obj);
    } else {
        console[level](msg);
    }
}
