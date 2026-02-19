import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';
import type { Resolved } from '@nzyme/ioc/Injectable.js';
import { defineService } from '@nzyme/ioc/Service.js';
import Dexie from 'dexie';

import type { LogEntry } from '../types/LogEntry.js';

/**
 * Persisted logger path entry - tracks all app/logger combinations seen.
 */
export interface LoggerPath {
    /** Primary key: "app" or "app/logger" format */
    path: string;
    /** App identifier */
    app: string;
    /** Logger name (null for app-level logs) */
    logger: string | null;
}

/**
 * Logger configuration entry - stores the minimum log level to show for a logger.
 * Logs at this level or higher (more severe) are shown.
 */
export interface LoggerConfig {
    /** Primary key: "app" or "app/logger" format */
    path: string;
    /** Minimum level to display. Logs at this level or more severe are shown. 'none' hides all. */
    minLevel: LoggerLevel | 'none';
}

/** Severity ranking: lower number = more severe. */
const LEVEL_SEVERITY: Record<LoggerLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
};

/** Levels ordered by severity (most severe first). */
const LEVELS_BY_SEVERITY: LoggerLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

/**
 * Database schema for logging-ui using Dexie.
 */
class LoggingDatabaseSchema extends Dexie {
    logs!: Dexie.Table<LogEntry, string>;
    loggerPaths!: Dexie.Table<LoggerPath, string>;
    loggerConfigs!: Dexie.Table<LoggerConfig, string>;

    constructor() {
        super('logging-ui');

        this.version(1).stores({
            // Logs indexed by timestamp for efficient sorting
            logs: 'id, timestamp',
            // Logger paths by path (app or app/logger)
            loggerPaths: 'path',
            // Logger configs by path
            loggerConfigs: 'path',
        });

        // Migration: LoggerConfig changed from disabledLevels to minLevel.
        this.version(2)
            .stores({
                logs: 'id, timestamp',
                loggerPaths: 'path',
                loggerConfigs: 'path',
            })
            .upgrade(tx => {
                return tx
                    .table('loggerConfigs')
                    .toCollection()
                    .modify(config => {
                        // Migrate old disabledLevels format to minLevel format.
                        // Old format: { path, disabledLevels: { error?: false, warn?: false, ... } }
                        // New format: { path, minLevel: LoggerLevel | 'none' }
                        const record = config as Record<string, unknown>;
                        if ('disabledLevels' in record && !('minLevel' in record)) {
                            const disabled = record['disabledLevels'] as Record<string, false | undefined>;
                            config.minLevel = convertDisabledLevelsToMinLevel(disabled);
                            delete record['disabledLevels'];
                        }
                    });
            });
    }
}

/**
 * Converts old disabledLevels format to minLevel.
 *
 * Walks from most severe (error) to least severe (trace) and returns the
 * least-severe level in the contiguous block of enabled levels starting from
 * the top. When disabled levels are non-contiguous (e.g., only debug disabled
 * while trace remains enabled), this errs on the side of filtering more rather
 * than silently re-enabling previously-disabled levels.
 */
function convertDisabledLevelsToMinLevel(disabled: Record<string, false | undefined>): LoggerLevel | 'none' {
    // Walk from most severe to least severe.
    // Return the last enabled level before hitting a disabled one.
    let lastEnabled: LoggerLevel | null = null;

    for (const level of LEVELS_BY_SEVERITY) {
        if (disabled[level] === false) {
            break;
        }
        lastEnabled = level;
    }

    return lastEnabled ?? 'none';
}

/**
 * Service for managing local IndexedDB database using Dexie.
 * Provides typed tables for logs, logger paths, and logger configs.
 */
export const LocalDatabase = defineService({
    name: 'LocalDatabase',
    setup() {
        const db = new LoggingDatabaseSchema();

        return {
            db,

            // Log operations
            async putLog(log: LogEntry): Promise<void> {
                await db.logs.put(log);
            },

            async loadLogs(limit: number): Promise<LogEntry[]> {
                return db.logs.orderBy('timestamp').reverse().limit(limit).toArray();
            },

            async deleteLogs(ids: string[]): Promise<void> {
                await db.logs.bulkDelete(ids);
            },

            async clearLogs(): Promise<void> {
                await db.logs.clear();
            },

            // Logger path operations
            async saveLoggerPath(loggerPath: LoggerPath): Promise<void> {
                await db.loggerPaths.put(loggerPath);
            },

            async loadLoggerPaths(): Promise<LoggerPath[]> {
                return db.loggerPaths.toArray();
            },

            async clearLoggerPaths(): Promise<void> {
                await db.loggerPaths.clear();
            },

            // Logger config operations
            async saveLoggerConfig(config: LoggerConfig): Promise<void> {
                await db.loggerConfigs.put(config);
            },

            async deleteLoggerConfig(path: string): Promise<void> {
                await db.loggerConfigs.delete(path);
            },

            async loadLoggerConfigs(): Promise<LoggerConfig[]> {
                return db.loggerConfigs.toArray();
            },

            async clearLoggerConfigs(): Promise<void> {
                await db.loggerConfigs.clear();
            },
        };
    },
});

export type LocalDatabase = Resolved<typeof LocalDatabase>;

/**
 * Helper to check if a level is below the configured minimum (should be hidden).
 */
export function isLevelDisabled(config: LoggerConfig | undefined, level: LoggerLevel): boolean {
    if (!config || !config.minLevel) {
        return false;
    }
    if (config.minLevel === 'none') {
        return true;
    }
    return LEVEL_SEVERITY[level] > LEVEL_SEVERITY[config.minLevel];
}

/**
 * Helper to get logger path in "app/logger" or "app" format.
 */
export function getLoggerPath(app: string, logger: string | null): string {
    return logger ? `${app}/${logger}` : app;
}
