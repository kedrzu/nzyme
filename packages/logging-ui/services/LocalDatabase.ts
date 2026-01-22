import type { LoggerLevel } from '@nzyme/logging';
import type { Resolved } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';
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
 * Disabled levels configuration for a logger.
 * Only stores levels that are disabled (sparse storage).
 */
export interface DisabledLevels {
    error?: false;
    warn?: false;
    info?: false;
    debug?: false;
    trace?: false;
}

/**
 * Logger configuration entry - stores which levels are disabled for a logger.
 */
export interface LoggerConfig {
    /** Primary key: "app" or "app/logger" format */
    path: string;
    /** Disabled levels (sparse - only store if disabled) */
    disabledLevels: DisabledLevels;
}

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
    }
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
 * Helper to check if a level is disabled in a config.
 */
export function isLevelDisabled(config: LoggerConfig | undefined, level: LoggerLevel): boolean {
    if (!config) {
        return false;
    }
    return config.disabledLevels[level] === false;
}

/**
 * Helper to check if a logger is completely disabled (all levels disabled).
 */
export function isLoggerDisabled(config: LoggerConfig | undefined): boolean {
    if (!config) {
        return false;
    }
    const levels: LoggerLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];
    return levels.every(level => config.disabledLevels[level] === false);
}

/**
 * Helper to get logger path in "app/logger" or "app" format.
 */
export function getLoggerPath(app: string, logger: string | null): string {
    return logger ? `${app}/${logger}` : app;
}
