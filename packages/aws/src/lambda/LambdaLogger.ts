import { pino } from 'pino';
import { lambdaRequestTracker, pinoLambdaDestination } from 'pino-lambda';

import { callerName, defineService } from '@nzyme/ioc';
import { Logger, fromPino } from '@nzyme/logging';

/**
 * A logger for lambda functions.
 */
export const LambdaLogger = defineService({
    name: 'LambdaLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
    },
    setup: ({ name }) => {
        const destination = pinoLambdaDestination();
        const logger = pino(
            {
                name,
            },
            destination,
        );

        return fromPino(logger);
    },
});

/**
 * A request tracker for lambda functions.
 */
export const LambdaRequestTracker = defineService({
    name: 'LambdaRequestTracker',
    resolution: 'transient',
    setup: () => lambdaRequestTracker(),
});
