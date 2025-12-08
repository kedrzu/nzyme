import chalk from 'chalk';
import { highlight } from 'cli-highlight';

import { defineService } from '@nzyme/ioc';
import { identity, parseStackTrace, toJsonString } from '@nzyme/utils';

import { ApplicationError } from './ApplicationError.js';
import type { LoggerLevel } from './LoggerLevel.js';
import { LoggerTransport } from './LoggerTransport.js';
import { getPrettyPrefix } from './utils/getPrettyPrefix.js';

/**
 * A console logger service for CLI with enhanced formatting.
 */
export const PrettyCliLoggerTransport = defineService({
    name: 'PrettyCliLoggerTransport',
    implements: LoggerTransport,
    setup: () => {
        return (logger, level, message, obj) => {
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
            console[level](message);

            if (obj?.error instanceof Error) {
                const { error, ...rest } = obj;
                obj = rest;

                const formattedError = formatError(error, prefix);
                console[level](formattedError);

                // Extract and merge ApplicationError data
                if (error instanceof ApplicationError) {
                    const { logger: _, ...errorData } = error.data;
                    obj = { ...obj, ...errorData };
                }
            }

            // Format and log other properties
            if (obj && Object.keys(obj).length > 0) {
                const formattedProps = formatObjectProperties(obj, prefix);
                console[level](formattedProps);
            }
        };
    },
});

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
            // Handle non-Error causes
            const cause = error.cause;
            try {
                let causeStr: string;
                if (typeof cause === 'string') {
                    causeStr = cause;
                } else if (typeof cause === 'number' || typeof cause === 'boolean') {
                    causeStr = String(cause);
                } else if (typeof cause === 'object' && cause !== null) {
                    causeStr = JSON.stringify(cause, null, 2);
                } else if (cause === null || cause === undefined) {
                    causeStr = String(cause);
                } else {
                    causeStr = '[unknown]';
                }

                const highlighted = highlight(causeStr, {
                    language: 'json',
                    ignoreIllegals: true,
                });
                const lines = highlighted.split('\n');
                for (const line of lines) {
                    output += prefix + '  ' + line + '\n';
                }
            } catch {
                // If JSON.stringify fails, fall back to string representation
                output += prefix + '  [object]\n';
            }
        }
    }

    return output.trimEnd();
}

function formatObjectProperties(obj: Record<string, unknown>, prefix: string): string {
    try {
        const json = toJsonString(obj, 2);
        const highlighted = highlight(json, {
            language: 'json',
            ignoreIllegals: true,
        });
        const lines = highlighted.split('\n');
        let output = '';
        for (const line of lines) {
            if (output.length > 0) {
                output += '\n';
            }
            output += prefix + line;
        }
        return output;
    } catch {
        return prefix + JSON.stringify(obj);
    }
}
