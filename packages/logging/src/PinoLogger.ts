import { pino } from 'pino';
import pretty from 'pino-pretty';

import { callerName, defineService, envVariable } from '@nzyme/ioc';

import { fromPino } from './fromPino.js';
import { Logger } from './Logger.js';

/**
 * A pino logger service.
 */
export const PinoLogger = defineService({
    name: 'PinoLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
        level: envVariable('LOG_LEVEL'),
    },
    setup: ({ name, level }) => fromPino(pino({ level, name })),
});

/**
 * A pretty logger service.
 */
export const PinoPrettyLogger = defineService({
    name: 'PinoPrettyLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
        level: envVariable('LOG_LEVEL'),
    },
    setup({ name }) {
        const stream = pretty({ colorize: true });
        const logger = pino({ name }, stream);

        return fromPino(logger);
    },
});
