import { defineService } from '@nzyme/ioc';
import { LoggerTransport } from '@nzyme/logging';
import { noop, toJsonString } from '@nzyme/utils';

import { LambdaContextProvider } from './LambdaContextProvider.js';

/**
 * A logger for lambda functions.
 */
export const LambdaLoggerTransport = defineService({
    name: 'LambdaLoggerTransport',
    implements: LoggerTransport,
    deps: {
        ctxProvider: LambdaContextProvider,
    },
    setup: ({ ctxProvider }) => {
        return {
            log: (logger, level, message, obj) => {
                console[level](toJsonString({ logger, level, message, ...obj, ...ctxProvider.get() }));
            },
            ctx: noop,
        };
    },
});
