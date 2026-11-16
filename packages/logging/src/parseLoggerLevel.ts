import { LOGGER_LEVELS } from './LoggerLevel.js';
import type { LoggerLevel } from './LoggerLevel.js';

/**
 * Parses a `LOG_LEVEL` value: `undefined` and `''` mean unset, anything else must be a level name, in
 * any case (`DEBUG` is `debug`).
 * The one parser behind both the DI variable and the pre-container read.
 *
 * @throws when the value is not one of {@link LOGGER_LEVELS}.
 * @__NO_SIDE_EFFECTS__
 */
export function parseLoggerLevel(value: string | undefined): LoggerLevel | undefined {
    if (value == null || value === '') {
        return undefined;
    }

    const normalized = value.toLowerCase();
    for (const level of LOGGER_LEVELS) {
        if (level === normalized) {
            return level;
        }
    }

    throw new Error(`Invalid LOG_LEVEL "${value}". Valid levels: ${LOGGER_LEVELS.join(', ')}.`);
}
