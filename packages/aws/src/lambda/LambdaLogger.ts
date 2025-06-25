import { callerName, defineService } from '@nzyme/ioc';
import type { LoggerLevel, LoggerObject } from '@nzyme/logging';
import { Logger } from '@nzyme/logging';
import { noop, toJsonString } from '@nzyme/utils';

import { LambdaContextProvider } from './LambdaContextProvider.js';
import type { types } from './types.js';

/**
 * A logger for lambda functions.
 */
export const LambdaLogger = defineService({
    name: 'LambdaLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
        ctxProvider: LambdaContextProvider,
    },
    setup: ({ name, ctxProvider }) => ({
        error: (msg: string, obj?: LoggerObject) => log(name, 'error', msg, obj, ctxProvider.get()),
        warn: (msg: string, obj?: LoggerObject) => log(name, 'warn', msg, obj, ctxProvider.get()),
        info: (msg: string, obj?: LoggerObject) => log(name, 'info', msg, obj, ctxProvider.get()),
        debug: (msg: string, obj?: LoggerObject) => log(name, 'debug', msg, obj, ctxProvider.get()),
        trace: (msg: string, obj?: LoggerObject) => log(name, 'trace', msg, obj, ctxProvider.get()),
        context: noop,
    }),
});

function log(
    logger: string | undefined,
    level: LoggerLevel,
    msg: string,
    obj: LoggerObject | undefined,
    ctx: types.Context | undefined,
) {
    console[level](toJsonString({ logger, level, msg, ...obj, ...ctx }));
}
