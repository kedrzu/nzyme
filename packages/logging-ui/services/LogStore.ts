import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';
import { consoleLog } from '@nzyme/logging/LoggerTransport.js';
import type { Resolved } from '@nzyme/ioc/Injectable.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { createExponentialBackoff } from '@nzyme/utils/createExponentialBackoff.js';
import { computed, reactive, ref, shallowRef } from 'vue';

import type { LogEntry } from '../types/LogEntry.js';
import type { DisabledLevels, LoggerConfig, LoggerPath } from './LocalDatabase.js';
import { getLoggerPath, isLevelDisabled, LocalDatabase } from './LocalDatabase.js';

const MAX_LOGS = 10000;

export const LOG_LEVELS: LoggerLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

/**
 * Color palette for apps and loggers (matches getPrettyPrefix colors).
 */
const COLORS = [
    '#f59e0b', // yellow
    '#22c55e', // green
    '#3b82f6', // blue
    '#d946ef', // magenta
    '#06b6d4', // cyan
    '#60a5fa', // blueBright
    '#4ade80', // greenBright
    '#facc15', // yellowBright
];

/**
 * Service for managing log state, filtering, and WebSocket connection.
 */
export const LogStore = defineService({
    name: 'LogStore',
    deps: {
        db: LocalDatabase,
    },
    setup({ db }) {
        // All logs (using shallowRef for performance with large arrays)
        const logs = shallowRef<LogEntry[]>([]);

        // Logger paths (all seen app/logger combinations, persisted)
        const loggerPaths = ref<LoggerPath[]>([]);

        // Logger configs (disabled levels per logger, persisted)
        const loggerConfigs = ref<Map<string, LoggerConfig>>(new Map());

        // Sort state
        const sortOrder = ref<'asc' | 'desc'>('desc');

        // Connection state
        const connected = ref(false);

        // Initialization state
        const initialized = ref(false);

        // Color mapping for logger paths
        const loggerPathColors = new Map<string, string>();
        let colorIndex = 0;

        // WebSocket connection
        let ws: WebSocket | null = null;
        let isReconnecting = false;
        let shouldReconnect = false;
        const backoff = createExponentialBackoff({
            baseDelay: 1000,
            maxDelay: 30000,
            maxRetries: Infinity,
        });

        // Unique apps for grouping in config table
        const uniqueApps = computed(() => {
            const apps = new Set<string>();
            for (const lp of loggerPaths.value) {
                apps.add(lp.app);
            }
            return Array.from(apps).sort();
        });

        // Logger paths grouped by app
        const loggerPathsByApp = computed(() => {
            const grouped = new Map<string, LoggerPath[]>();
            for (const lp of loggerPaths.value) {
                const existing = grouped.get(lp.app) ?? [];
                existing.push(lp);
                grouped.set(lp.app, existing);
            }
            // Sort loggers within each app
            for (const [, paths] of grouped) {
                paths.sort((a, b) => {
                    const aName = a.logger ?? '';
                    const bName = b.logger ?? '';
                    return aName.localeCompare(bName);
                });
            }
            return grouped;
        });

        // Filtered and sorted logs
        const filteredLogs = computed(() => {
            let result = logs.value;

            // Filter by logger config (hide disabled loggers/levels)
            if (loggerConfigs.value.size > 0) {
                result = result.filter(log => {
                    const path = getLoggerPath(log.app, log.logger);
                    const config = loggerConfigs.value.get(path);
                    // If level is disabled in config, filter out
                    return !isLevelDisabled(config, log.level);
                });
            }

            // Sort by timestamp
            const sorted = [...result].sort((a, b) => {
                const diff = a.timestamp - b.timestamp;
                return sortOrder.value === 'desc' ? -diff : diff;
            });

            return sorted;
        });

        /**
         * Assign color to a logger path if not already assigned.
         */
        function assignLoggerColor(path: string): void {
            if (!loggerPathColors.has(path)) {
                loggerPathColors.set(path, COLORS[colorIndex++ % COLORS.length]!);
            }
        }

        /**
         * Register a logger path (persists to IndexedDB if new).
         */
        async function registerLoggerPath(app: string, logger: string | null): Promise<void> {
            const path = getLoggerPath(app, logger);

            // Check if already known
            const existing = loggerPaths.value.find(lp => lp.path === path);
            if (existing) {
                return;
            }

            const newLoggerPath: LoggerPath = { path, app, logger };
            loggerPaths.value = [...loggerPaths.value, newLoggerPath];

            // Persist to IndexedDB (fire-and-forget)
            void db.saveLoggerPath(newLoggerPath);
        }

        /**
         * Add a log entry.
         * @param log - The log entry to add
         * @param persist - Whether to persist to IndexedDB (false for restored logs)
         */
        function addLog(log: LogEntry, persist = true): void {
            const path = getLoggerPath(log.app, log.logger);

            // Assign color if needed
            assignLoggerColor(path);

            // Register logger path
            void registerLoggerPath(log.app, log.logger);

            // Add to logs array (trigger reactivity with new array)
            const newLogs = [log, ...logs.value];

            // Cap at MAX_LOGS and track evicted entries
            const evictedIds: string[] = [];
            if (newLogs.length > MAX_LOGS) {
                for (let i = MAX_LOGS; i < newLogs.length; i++) {
                    evictedIds.push(newLogs[i]!.id);
                }
                newLogs.length = MAX_LOGS;
            }

            logs.value = newLogs;

            // Persist to IndexedDB (fire-and-forget)
            if (persist) {
                void db.putLog(log);
                if (evictedIds.length > 0) {
                    void db.deleteLogs(evictedIds);
                }
            }
        }

        /**
         * Clear all logs (in-memory and persisted).
         * Does NOT clear logger paths or configs.
         */
        function clearLogs(): void {
            logs.value = [];
            // Clear persisted logs (fire-and-forget)
            void db.clearLogs();
        }

        /**
         * Set the disabled levels for a logger.
         */
        function setLoggerConfig(path: string, disabledLevels: DisabledLevels): void {
            // Check if all levels are enabled (no disabled levels)
            const hasDisabledLevels = Object.values(disabledLevels).some(v => v === false);

            if (hasDisabledLevels) {
                const config: LoggerConfig = { path, disabledLevels };
                const newConfigs = new Map(loggerConfigs.value);
                newConfigs.set(path, config);
                loggerConfigs.value = newConfigs;

                // Persist to IndexedDB (fire-and-forget)
                void db.saveLoggerConfig(config);
            } else {
                // Remove config if no levels are disabled
                const newConfigs = new Map(loggerConfigs.value);
                newConfigs.delete(path);
                loggerConfigs.value = newConfigs;

                // Delete from IndexedDB (fire-and-forget)
                void db.deleteLoggerConfig(path);
            }
        }

        /**
         * Toggle a specific level for a logger.
         */
        function toggleLevel(path: string, level: LoggerLevel): void {
            const config = loggerConfigs.value.get(path);
            const currentDisabled = config?.disabledLevels[level] === false;

            const newDisabledLevels: DisabledLevels = {
                ...(config?.disabledLevels ?? {}),
            };

            if (currentDisabled) {
                // Enable the level (remove from disabled)
                delete newDisabledLevels[level];
            } else {
                // Disable the level
                newDisabledLevels[level] = false;
            }

            setLoggerConfig(path, newDisabledLevels);
        }

        /**
         * Toggle all levels for a logger (enable all or disable all).
         */
        function toggleAllLevels(path: string): void {
            const config = loggerConfigs.value.get(path);
            const isFullyEnabled = !config || Object.keys(config.disabledLevels).length === 0;

            if (isFullyEnabled) {
                // Disable all levels
                const disabledLevels: DisabledLevels = {
                    error: false,
                    warn: false,
                    info: false,
                    debug: false,
                    trace: false,
                };
                setLoggerConfig(path, disabledLevels);
            } else {
                // Enable all levels (clear config)
                setLoggerConfig(path, {});
            }
        }

        /**
         * Check if a specific level is enabled for a logger.
         */
        function isLevelEnabled(path: string, level: LoggerLevel): boolean {
            const config = loggerConfigs.value.get(path);
            return !isLevelDisabled(config, level);
        }

        /**
         * Check if a logger has all levels enabled.
         */
        function isLoggerFullyEnabled(path: string): boolean {
            const config = loggerConfigs.value.get(path);
            return !config || Object.keys(config.disabledLevels).length === 0;
        }

        /**
         * Check if a logger has at least one level enabled.
         */
        function isLoggerPartiallyEnabled(path: string): boolean {
            const config = loggerConfigs.value.get(path);
            if (!config) {
                return false; // Fully enabled, not partially
            }
            const disabledCount = Object.keys(config.disabledLevels).length;
            return disabledCount > 0 && disabledCount < LOG_LEVELS.length;
        }

        /**
         * Reset all logger configs (show everything).
         */
        function resetLoggerConfigs(): void {
            loggerConfigs.value = new Map();
            // Clear from IndexedDB (fire-and-forget)
            void db.clearLoggerConfigs();
        }

        /**
         * Get the color for a logger path.
         */
        function getLoggerPathColor(log: LogEntry): string {
            const path = getLoggerPath(log.app, log.logger);
            return loggerPathColors.get(path) ?? COLORS[0]!;
        }

        /**
         * Get the color for a logger path string.
         */
        function getLoggerColorByPath(path: string): string {
            return loggerPathColors.get(path) ?? COLORS[0]!;
        }

        /**
         * Get the display name for a logger (app/logger format).
         */
        function getLoggerPathDisplay(log: LogEntry): string {
            return getLoggerPath(log.app, log.logger);
        }

        /**
         * Connect to the WebSocket server.
         */
        function connect(): void {
            if (ws) {
                return;
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = `${protocol}//${window.location.host}/logs`;

            consoleLog('LogStore', 'info', 'Connecting to WebSocket server', { url });

            try {
                ws = new WebSocket(url);

                ws.onopen = () => {
                    connected.value = true;
                    consoleLog('LogStore', 'info', 'WebSocket connected');
                    // Reset backoff on successful connection
                    backoff.reset();
                };

                ws.onmessage = event => {
                    try {
                        const log = JSON.parse(event.data as string) as LogEntry;
                        addLog(log);
                    } catch {
                        consoleLog('LogStore', 'error', 'Failed to parse log message', {
                            data: event.data,
                        });
                    }
                };

                ws.onclose = () => {
                    connected.value = false;
                    ws = null;
                    if (shouldReconnect) {
                        void scheduleReconnect();
                    }
                };

                ws.onerror = () => {
                    // Will be followed by onclose
                };
            } catch (error) {
                consoleLog('LogStore', 'error', 'Failed to create WebSocket', { error });
                if (shouldReconnect) {
                    void scheduleReconnect();
                }
            }
        }

        /**
         * Disconnect from the WebSocket server.
         */
        function disconnect(): void {
            shouldReconnect = false;
            backoff.reset();
            if (ws) {
                ws.close();
                ws = null;
            }
            connected.value = false;
        }

        /**
         * Schedule a reconnection attempt with exponential backoff.
         */
        async function scheduleReconnect(): Promise<void> {
            if (isReconnecting || !shouldReconnect) {
                return;
            }

            isReconnecting = true;
            const retryNumber = backoff.retries + 1;
            consoleLog('LogStore', 'info', `Scheduling reconnect attempt ${retryNumber}...`);

            await backoff.backoff();

            isReconnecting = false;

            if (shouldReconnect) {
                connect();
            }
        }

        /**
         * Initialize the store (load from IndexedDB, connect WebSocket).
         */
        async function initialize(): Promise<void> {
            if (initialized.value) {
                return;
            }

            // Load logger paths
            const storedPaths = await db.loadLoggerPaths();
            for (const lp of storedPaths) {
                assignLoggerColor(lp.path);
            }
            loggerPaths.value = storedPaths;

            // Load logger configs
            const storedConfigs = await db.loadLoggerConfigs();
            const configMap = new Map<string, LoggerConfig>();
            for (const config of storedConfigs) {
                configMap.set(config.path, config);
            }
            loggerConfigs.value = configMap;

            // Load persisted logs
            const restoredLogs = await db.loadLogs(MAX_LOGS);
            if (restoredLogs.length > 0) {
                // Initialize colors for restored logs
                for (const log of restoredLogs) {
                    const path = getLoggerPath(log.app, log.logger);
                    assignLoggerColor(path);
                }
                logs.value = restoredLogs;
            }

            initialized.value = true;

            // Enable reconnection and connect to websocket
            shouldReconnect = true;
            connect();
        }

        return reactive({
            // State
            logs: filteredLogs,
            allLogs: logs,
            loggerPaths,
            loggerConfigs,
            connected,
            sortOrder,
            initialized,

            // Computed
            uniqueApps,
            loggerPathsByApp,
            logLevels: LOG_LEVELS,

            // Actions
            initialize,
            clearLogs,
            disconnect,

            // Logger config
            setLoggerConfig,
            toggleLevel,
            toggleAllLevels,
            isLevelEnabled,
            isLoggerFullyEnabled,
            isLoggerPartiallyEnabled,
            resetLoggerConfigs,

            // Logger display
            getLoggerPathColor,
            getLoggerColorByPath,
            getLoggerPathDisplay,
        });
    },
});

export type LogStore = Resolved<typeof LogStore>;
