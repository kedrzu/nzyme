import chalk from 'chalk';

import { callerName, defineService } from '@nzyme/ioc';
import { noop } from '@nzyme/utils';

import type { LoggerObject } from './Logger.js';
import { Logger } from './Logger.js';

let i = 0;
const colors = [
    chalk.yellow,
    chalk.green,
    chalk.blue,
    chalk.magenta,
    chalk.cyan,
    chalk.blueBright,
    chalk.greenBright,
    chalk.yellowBright,
];

// To make sure that for the same name, the same color is used
const prefixCache = new Map<string, string>();

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
        const prefix = getPrefix(name);

        return {
            prefix,
            error: (msg: string, obj?: LoggerObject) => log(prefix, console.error, msg, obj),
            warn: (msg: string, obj?: LoggerObject) => log(prefix, console.warn, msg, obj),
            info: (msg: string, obj?: LoggerObject) => log(prefix, console.log, msg, obj),
            debug: (msg: string, obj?: LoggerObject) => log(prefix, console.debug, msg, obj),
            trace: (msg: string, obj?: LoggerObject) => log(prefix, console.trace, msg, obj),
            context: noop,
        };
    },
});

function log(prefix: string, log: (...args: unknown[]) => void, msg: string, obj?: LoggerObject) {
    const lines = msg.split('\n');
    if (lines.length > 1) {
        msg = '';

        for (const line of lines) {
            if (msg.length > 0) {
                msg += '\n';
            }

            msg += `${prefix}${line}`;
        }

        if (obj) {
            log(prefix, obj);
        }
    } else {
        msg = `${prefix}${msg}`;
    }

    if (obj) {
        log(msg, obj);
    } else {
        log(msg);
    }
}

function getPrefix(name: string | undefined) {
    if (!name) {
        return '';
    }

    if (prefixCache.has(name)) {
        return prefixCache.get(name)!;
    }

    const color = colors[i++ % colors.length]!;
    const prefix = color(`[${name}] `);
    prefixCache.set(name, prefix);
    return prefix;
}
