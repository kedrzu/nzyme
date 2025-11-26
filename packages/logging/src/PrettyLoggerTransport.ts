import chalk from 'chalk';

import { defineService } from '@nzyme/ioc';
import { identity } from '@nzyme/utils';

import type { LoggerLevel } from './LoggerLevel.js';
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
        return (logger, level, message, obj) => {
            const prefix = getPrefix(logger);
            const color = getColor(level);
            const lines = message.split('\n');
            if (lines.length > 1) {
                message = '';

                for (const line of lines) {
                    if (message.length > 0) {
                        message += '\n';
                    }

                    message += `${prefix}${color(line)}`;
                }

                if (obj) {
                    console[level](message, obj);
                }
            } else {
                message = `${prefix}${color(message)}`;
            }

            if (obj) {
                console[level](message, obj);
            } else {
                console[level](message);
            }
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

function getColor(level: LoggerLevel): (text: string) => string {
    switch (level) {
        case 'debug':
            return chalk.gray;
        case 'error':
            return chalk.red;
        case 'warn':
            return chalk.yellow;
        default:
            return identity;
    }
}
