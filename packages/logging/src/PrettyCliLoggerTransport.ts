import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { stringify } from 'yaml';

import { defineService } from '@nzyme/ioc/Service.js';
import { identity } from '@nzyme/utils/functions/identity.js';
import { parseStackTrace } from '@nzyme/utils/parseStackTrace.js';

import { LOG_LEVEL } from './env.js';
import { getEnabledLoggerLevels } from './getEnabledLoggerLevels.js';
import { ApplicationError } from './ApplicationError.js';
import type { LoggerLevel } from './LoggerLevel.js';
import { LoggerTransport } from './LoggerTransport.js';
import { getPrettyPrefix } from './utils/getPrettyPrefix.js';

/**
 * A console logger service for CLI with enhanced formatting.
 *
 * Every level goes to stderr: a command's stdout is its output, which callers pipe and parse, so a
 * log line there corrupts it. `LOG_LEVEL` sets the minimum level; unset, it is `info`, so a command's
 * routine startup (`debug`, `trace`) stays silent.
 */
export const PrettyCliLoggerTransport = defineService({
    name: 'PrettyCliLoggerTransport',
    implements: LoggerTransport,
    deps: { logLevel: LOG_LEVEL },
    setup: ({ logLevel }): LoggerTransport => {
        const enabled = getEnabledLoggerLevels(logLevel ?? 'info');

        return (logger, level, message, obj) => {
            if (!enabled[level]) {
                return;
            }

            const prefix = getPrettyPrefix(logger);
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
            } else {
                message = `${prefix}${color(message)}`;
            }

            // Log the main message
            console.error(message);

            if (obj?.error instanceof Error) {
                const { error, ...rest } = obj;
                obj = rest;

                const formattedError = formatError(error, prefix);
                console.error(formattedError);

                // Extract and merge ApplicationError data
                if (error instanceof ApplicationError) {
                    const { logger: _, ...errorData } = error.data;
                    obj = { ...obj, ...errorData };
                }
            }

            // Format and log other properties
            if (obj && Object.keys(obj).length > 0) {
                console.error(formatData(obj, prefix));
            }
        };
    },
});

/** Colours for the token classes highlight.js's YAML grammar emits. */
const YAML_THEME = {
    attr: chalk.cyan,
    string: chalk.green,
    number: chalk.yellow,
    literal: chalk.magenta,
    bullet: chalk.dim,
    meta: chalk.blue,
    type: chalk.blue,
} as const;

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

function formatError(error: Error, prefix: string): string {
    let output = '';

    // Format stack trace
    if (error.stack) {
        const frames = parseStackTrace(error.stack);
        for (const frame of frames) {
            if (frame.type === 'function') {
                output +=
                    prefix +
                    chalk.gray('  at ') +
                    chalk.cyan(frame.name) +
                    ' ' +
                    chalk.dim(`(${frame.filePath})`) +
                    '\n';
            } else if (frame.type === 'simple') {
                output += prefix + chalk.gray('  at ') + chalk.dim(frame.text) + '\n';
            } else {
                output += prefix + chalk.dim('  ' + frame.text) + '\n';
            }
        }
    }

    // Format error.cause if it exists
    if (error.cause) {
        output += '\n' + prefix + chalk.yellow('Caused by:') + '\n';
        if (error.cause instanceof Error) {
            // Recursively format the cause error
            const causeLines = formatError(error.cause, prefix + '  ');
            output += causeLines;
        } else {
            output += formatData(error.cause, prefix + '  ') + '\n';
        }
    }

    return output.trimEnd();
}

/**
 * Renders a value as highlighted YAML, every line led by `prefix` and a dim `›` gutter marker.
 * Never throws: a value YAML cannot serialise prints one `[unserializable data]` line.
 */
function formatData(value: unknown, prefix: string): string {
    const marker = prefix + chalk.dim('›') + ' ';

    try {
        const yaml = stringify(value, (_key, item: unknown) =>
            typeof item === 'function' ? undefined : item,
        ).trimEnd();
        const highlighted = highlight(yaml, {
            language: 'yaml',
            theme: YAML_THEME,
            ignoreIllegals: true,
        });

        return highlighted
            .split('\n')
            .map(line => marker + line)
            .join('\n');
    } catch {
        return marker + '[unserializable data]';
    }
}
