import { LOGGER_LEVELS } from './LoggerLevel.js';
import type { LoggerLevel } from './LoggerLevel.js';

/** A minimum level, or `'none'` to enable nothing. */
export type LoggerThreshold = LoggerLevel | 'none';

/** Which levels pass a threshold, so a per-log check is a property lookup. */
export type EnabledLoggerLevels = Readonly<Record<LoggerLevel, boolean>>;

const ENABLED_LEVELS: Readonly<Record<LoggerThreshold, EnabledLoggerLevels>> = {
    trace: createEnabledLevels(0),
    debug: createEnabledLevels(1),
    info: createEnabledLevels(2),
    warn: createEnabledLevels(3),
    error: createEnabledLevels(4),
    none: createEnabledLevels(LOGGER_LEVELS.length),
};

/**
 * Returns the precomputed, frozen map of levels a threshold lets through (`trace` = all, `none` =
 * nothing). The same object comes back on every call: resolve it once, then check `enabled[level]`
 * per log instead of comparing levels.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getEnabledLoggerLevels(threshold: LoggerThreshold): EnabledLoggerLevels {
    return ENABLED_LEVELS[threshold];
}

/**
 * The frozen map of levels at or above `thresholdIndex` in `LOGGER_LEVELS`.
 * @__NO_SIDE_EFFECTS__
 */
function createEnabledLevels(thresholdIndex: number): EnabledLoggerLevels {
    return Object.freeze({
        trace: LOGGER_LEVELS.indexOf('trace') >= thresholdIndex,
        debug: LOGGER_LEVELS.indexOf('debug') >= thresholdIndex,
        info: LOGGER_LEVELS.indexOf('info') >= thresholdIndex,
        warn: LOGGER_LEVELS.indexOf('warn') >= thresholdIndex,
        error: LOGGER_LEVELS.indexOf('error') >= thresholdIndex,
    });
}
