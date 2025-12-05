import { defineService } from '@nzyme/ioc';

import { LoggerTransport } from './LoggerTransport.js';
import { getPrettyPrefix } from './utils/getPrettyPrefix.js';

/**
 * A console logger service for browser environments.
 */
export const PrettyBrowserLoggerTransport = defineService({
    name: 'PrettyBrowserLoggerTransport',
    implements: LoggerTransport,
    setup: () => {
        return (logger, level, message, obj) => {
            const prefix = getPrettyPrefix(logger);
            const lines = message.split('\n');
            if (lines.length > 1) {
                message = '';

                for (const line of lines) {
                    if (message.length > 0) {
                        message += '\n';
                    }

                    message += `${prefix}${line}`;
                }
            } else {
                message = `${prefix}${message}`;
            }

            let err: Error | undefined;
            if (obj?.error instanceof Error) {
                const { error, ...rest } = obj;
                obj = rest;
                err = error;
            }

            const args = [obj, err].filter(Boolean) as unknown[];
            console[level](message, ...args);
        };
    },
});
