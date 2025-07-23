import chalk from 'chalk';

import { defineService } from '@nzyme/ioc';
import { noop } from '@nzyme/utils';

import { LoggerTransport } from './LoggerTransport.js';

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
export const PrettyLoggerTransport = defineService({
    name: 'PrettyLoggerTransport',
    implements: LoggerTransport,
    setup: () => {
        return {
            log: (logger, level, message, obj) => {
                const prefix = getPrefix(logger);
                const lines = message.split('\n');
                if (lines.length > 1) {
                    message = '';

                    for (const line of lines) {
                        if (message.length > 0) {
                            message += '\n';
                        }

                        message += `${prefix}${line}`;
                    }

                    if (obj) {
                        console[level](message, obj);
                    }
                } else {
                    message = `${prefix}${message}`;
                }

                if (obj) {
                    console[level](message, obj);
                } else {
                    console[level](message);
                }
            },
            ctx: noop,
        };
    },
});

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
