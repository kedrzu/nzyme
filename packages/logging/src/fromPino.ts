import type { Logger as PinoLogger } from 'pino';

import type { Logger } from './Logger.js';

/**
 * Wrap a Pino logger in a Logger instance.
 */
export function fromPino(pino: PinoLogger): Logger {
    return {
        error: (msg: string, obj?: object) => pino.error(obj, msg),
        warn: (msg: string, obj?: object) => pino.warn(obj, msg),
        info: (msg: string, obj?: object) => pino.info(obj, msg),
        debug: (msg: string, obj?: object) => pino.debug(obj, msg),
        trace: (msg: string, obj?: object) => pino.trace(obj, msg),
        fatal: (msg: string, obj?: object) => pino.fatal(obj, msg),
    };
}
