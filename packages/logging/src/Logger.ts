import { pino } from 'pino';
import type { Logger as PinoLogger } from 'pino';

import { callerName, defineInjectable, defineInterface, defineService } from '@nzyme/ioc';

/**
 * A logger instance.
 */
export type Logger = PinoLogger;

/**
 * A logger interface.
 */
export const Logger = defineInterface<Logger>({
    name: 'Logger',
    default: defineInjectable({
        resolve: (container, caller): Logger => {
            return DefaultLogger.resolve(container, caller);
        },
    }),
});

/**
 * A default logger service.
 */
export const DefaultLogger = defineService({
    name: 'DefaultLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        name: callerName(),
    },
    setup: ({ name }) => pino({ name }),
});
