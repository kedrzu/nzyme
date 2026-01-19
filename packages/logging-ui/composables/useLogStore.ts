import type { LoggerLevel } from '@nzyme/logging';
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';

import type { LogEntry } from '../types/LogEntry.js';

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

    // Filter state
    const selectedLoggers = ref<string[]>([]);
    const selectedLevels = ref<LoggerLevel[]>([]);

    // Sort state
    const sortOrder = ref<'asc' | 'desc'>('desc');

    // Connection state
    const connected = ref(false);

    // Color mapping for logger paths
    const loggerPathColors = new Map<string, string>();
    let colorIndex = 0;

    // WebSocket connection
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

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

        // Filter by logger path
        if (selectedLoggers.value.length > 0) {
            result = result.filter(log => selectedLoggers.value.includes(getLoggerPath(log)));
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
     * Add a log entry.
     */
    function addLog(log: LogEntry): void {
        // Assign color if needed
        const loggerPath = getLoggerPath(log);
        if (!loggerPathColors.has(loggerPath)) {
            loggerPathColors.set(loggerPath, COLORS[colorIndex++ % COLORS.length]!);
        }

        // Add to logs array (trigger reactivity with new array)
        const newLogs = [log, ...logs.value];

        // Cap at MAX_LOGS
        if (newLogs.length > MAX_LOGS) {
            newLogs.length = MAX_LOGS;
        }

        logs.value = newLogs;
    }

    /**
     * Clear all logs.
     */
    function clearLogs(): void {
        logs.value = [];
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

        try {
            ws = new WebSocket(url);

            ws.onopen = () => {
                connected.value = true;
            };

            ws.onmessage = event => {
                try {
                    const log = JSON.parse(event.data as string) as LogEntry;
                    addLog(log);
                } catch {
                    console.error('Failed to parse log message:', event.data);
                }
            };

            ws.onclose = () => {
                connected.value = false;
                ws = null;
                scheduleReconnect();
            };

            ws.onerror = () => {
                // Will be followed by onclose
            };
        } catch {
            scheduleReconnect();
        }
    }

    /**
     * Disconnect from the WebSocket server.
     */
    function disconnect(): void {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
        connected.value = false;
    }

    /**
     * Schedule a reconnection attempt.
     */
    function scheduleReconnect(): void {
        if (reconnectTimeout) {
            return;
        }
        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
        }, 2000);
    }

    // Auto-connect on mount
    onMounted(() => {
        connect();
    });

    // Cleanup on unmount
    onUnmounted(() => {
        disconnect();
    });

    return {
        // State
        logs: filteredLogs,
        connected,

        // Filters
        selectedLoggers,
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
