import type { LoggerLevel } from '@nzyme/logging';
import { consoleLog } from '@nzyme/logging';
import { createExponentialBackoff } from '@nzyme/utils';
import { storageRef } from '@nzyme/vue-utils';
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';

import type { LogEntry } from '../types/LogEntry.js';
import { clearAllLogs, deleteLogs, loadLogs, putLog } from '../utils/logsIndexedDb.js';

const MAX_LOGS = 10000;

const LOG_LEVELS: LoggerLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

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
 * Get logger path in "app/logger" format.
 */
function getLoggerPath(log: LogEntry): string {
    return log.logger ? `${log.app}/${log.logger}` : log.app;
}

/**
 * Composable for managing log state, filtering, and WebSocket connection.
 */
export function useLogStore() {
    // All logs (using shallowRef for performance with large arrays)
    const logs = shallowRef<LogEntry[]>([]);

    // Filter state (persisted in localStorage)
    // hiddenLoggers stores loggers that are excluded from view (exclusive logic)
    const hiddenLoggers = storageRef<string[]>({
        key: 'logging-ui:hiddenLoggers',
        storage: 'local',
        json: true,
        default: () => [],
    });
    const selectedLevels = storageRef<LoggerLevel[]>({
        key: 'logging-ui:selectedLevels',
        storage: 'local',
        json: true,
        default: () => [],
    });

    // Sort state
    const sortOrder = ref<'asc' | 'desc'>('desc');

    // Connection state
    const connected = ref(false);

    // Color mapping for logger paths
    const loggerPathColors = new Map<string, string>();
    let colorIndex = 0;

    // WebSocket connection
    let ws: WebSocket | null = null;
    let isReconnecting = false;
    let shouldReconnect = true;
    let isUnmounted = false;
    const backoff = createExponentialBackoff({
        baseDelay: 1000,
        maxDelay: 30000,
        maxRetries: Infinity,
    });

    // Unique logger paths for filter options
    const uniqueLoggers = computed(() => {
        const loggers = new Set<string>();
        for (const log of logs.value) {
            loggers.add(getLoggerPath(log));
        }
        return Array.from(loggers).sort();
    });

    // Filtered and sorted logs
    const filteredLogs = computed(() => {
        let result = logs.value;

        // Filter by logger path (exclusive logic: hide loggers in hiddenLoggers)
        if (hiddenLoggers.value.length > 0) {
            result = result.filter(log => !hiddenLoggers.value.includes(getLoggerPath(log)));
        }

        // Filter by level
        if (selectedLevels.value.length > 0) {
            result = result.filter(log => selectedLevels.value.includes(log.level));
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
    function assignLoggerColor(loggerPath: string): void {
        if (!loggerPathColors.has(loggerPath)) {
            loggerPathColors.set(loggerPath, COLORS[colorIndex++ % COLORS.length]!);
        }
    }

    /**
     * Add a log entry.
     * @param log - The log entry to add
     * @param persist - Whether to persist to IndexedDB (false for restored logs)
     */
    function addLog(log: LogEntry, persist = true): void {
        // Assign color if needed
        const loggerPath = getLoggerPath(log);
        assignLoggerColor(loggerPath);

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
            putLog(log);
            if (evictedIds.length > 0) {
                deleteLogs(evictedIds);
            }
        }
    }

    /**
     * Clear all logs (in-memory and persisted).
     */
    function clearLogs(): void {
        logs.value = [];
        // Clear persisted logs (fire-and-forget)
        clearAllLogs();
    }

    /**
     * Get the color for a logger path.
     */
    function getLoggerPathColor(log: LogEntry): string {
        const loggerPath = getLoggerPath(log);
        return loggerPathColors.get(loggerPath) ?? COLORS[0]!;
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
        return getLoggerPath(log);
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
                    consoleLog('LogStore', 'error', 'Failed to parse log message', { data: event.data });
                }
            };

            ws.onclose = () => {
                connected.value = false;
                ws = null;
                if (shouldReconnect) {
                    scheduleReconnect();
                }
            };

            ws.onerror = () => {
                // Will be followed by onclose
            };
        } catch (error) {
            consoleLog('LogStore', 'error', 'Failed to create WebSocket', { error });
            if (shouldReconnect) {
                scheduleReconnect();
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

    // Restore logs from IndexedDB and connect on mount
    onMounted(async () => {
        // Restore persisted logs
        const restoredLogs = await loadLogs(MAX_LOGS);
        if (restoredLogs.length > 0) {
            // Initialize colors for restored logs
            for (const log of restoredLogs) {
                assignLoggerColor(getLoggerPath(log));
            }
            logs.value = restoredLogs;
        }

        // Skip WebSocket connection if component was unmounted during async loadLogs
        if (isUnmounted) {
            return;
        }

        // Enable reconnection and connect to websocket
        shouldReconnect = true;
        connect();
    });

    // Cleanup on unmount
    onUnmounted(() => {
        isUnmounted = true;
        disconnect();
    });

    return {
        // State
        logs: filteredLogs,
        connected,

        // Filters
        hiddenLoggers,
        selectedLevels,
        sortOrder,

        // Filter options
        uniqueLoggers,
        logLevels: LOG_LEVELS,

        // Actions
        clearLogs,

        // Logger display
        getLoggerPathColor,
        getLoggerColorByPath,
        getLoggerPathDisplay,
    };
}
