import { getEnabledLoggerLevels } from './getEnabledLoggerLevels.js';
import type { EnabledLoggerLevels, LoggerThreshold } from './getEnabledLoggerLevels.js';
import type { LoggerLevel } from './LoggerLevel.js';
import { parseLoggerLevel } from './parseLoggerLevel.js';

/** Options for reading `LOG_LEVEL` outside a container. */
export interface ProcessLoggerLevelsOptions {
    /** Threshold used when `LOG_LEVEL` is unset; `'none'` enables nothing. */
    fallback: LoggerThreshold;
}

const cache = new Map<LoggerThreshold, EnabledLoggerLevels>();

/**
 * Resolves the levels enabled by `LOG_LEVEL` for code that runs where no container exists (the
 * `.env` loader, test transports, the console transport in a browser). It is the one place outside
 * DI that reads the variable, and it does not throw when `process` is missing. The map is memoized
 * per fallback on first call, so later calls cost a lookup.
 */
export function getProcessLoggerLevels({ fallback }: ProcessLoggerLevelsOptions): EnabledLoggerLevels {
    let enabled = cache.get(fallback);

    if (!enabled) {
        enabled = getEnabledLoggerLevels(parseLoggerLevel(readLogLevel()) ?? fallback);
        cache.set(fallback, enabled);
    }

    return enabled;
}

/**
 * @util Tells whether `LOG_LEVEL` enables a level in pre-container code, falling back to `fallback` when unset.
 */
export function shouldLog(level: LoggerLevel, options: ProcessLoggerLevelsOptions): boolean {
    return getProcessLoggerLevels(options)[level];
}

/** Forgets the memoized maps so a test can change `LOG_LEVEL` and read it again. */
export function resetProcessLoggerLevels(): void {
    cache.clear();
}

function readLogLevel(): string | undefined {
    return typeof process === 'undefined' ? undefined : process.env.LOG_LEVEL;
}
