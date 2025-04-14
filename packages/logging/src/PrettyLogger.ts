import { pino } from 'pino';
import pretty from 'pino-pretty';

import { callerName, defineService } from '@nzyme/ioc';

import { fromPino } from './fromPino.js';
import { Logger } from './Logger.js';

/**
 * A pretty logger service.
 */
export const PrettyLogger = defineService({
    name: 'PrettyLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
    },
    setup({ name }) {
        const stream = pretty({ colorize: true });
        const logger = pino({ name }, stream);

        return fromPino(logger);
    },
});
