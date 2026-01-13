import debounce from 'lodash.debounce';

import { defineInterface, defineService } from '@nzyme/ioc';
import { LoggerTransport } from '@nzyme/logging';
import { toJsonString } from '@nzyme/utils';

/**
 * Options for configuring the Grafana Loki logger transport.
 */
export interface GrafanaLoggerTransportOptions {
    /**
     * Application name to use as a Loki label.
     */
    app?: string;

    /**
     * The base URL of the Loki instance.
     * @default 'http://localhost:3100'
     */
    url?: string;

    /**
     * The endpoint path for pushing logs to Loki.
     * @default '/loki/api/v1/push'
     */
    endpoint?: string;

    /**
     * Debounce window in milliseconds for batching logs.
     * @default 500
     */
    flushDebounceMs?: number;

    /**
     * Maximum number of log entries to buffer before forcing a flush.
     * @default 100
     */
    maxBatchSize?: number;

    /**
     * Optional HTTP headers to include in push requests.
     */
    headers?: Record<string, string>;
}

/**
 * Injectable options token for Grafana Loki logger transport.
 */
export const GrafanaLoggerTransportOptions = defineInterface<GrafanaLoggerTransportOptions>({
    name: 'GrafanaLoggerTransportOptions',
    default: () => ({}),
});

/**
 * Options for creating a Grafana Loki logger transport instance.
 */
export interface GrafanaLoggerTransportCreateOptions extends GrafanaLoggerTransportOptions {
    /**
     * Application name to use as a Loki label.
     */
    app: string;
}

/**
 * Loki log entry.
 */
interface LokiEntry {
    /**
     * Timestamp in nanoseconds as a string.
     */
    ts: string;
    /**
     * Log line (JSON stringified).
     */
    line: string;
}

/**
 * Loki stream with labels and entries.
 */
interface LokiStream {
    /**
     * Stream labels.
     */
    stream: Partial<Record<string, string>>;
    /**
     * Log entries for this stream.
     */
    values: [string, string][];
}

/**
 * Loki push API payload.
 */
interface LokiPushPayload {
    /**
     * Array of log streams.
     */
    streams: LokiStream[];
}

/**
 * Factory for creating Grafana Loki logger transports.
 */
export const GrafanaLoggerTransport = defineService({
    name: 'GrafanaLoggerTransport',
    implements: LoggerTransport,
    deps: {
        options: GrafanaLoggerTransportOptions,
    },
    setup({ options }) {
        const url = options.url ?? 'http://localhost:3100';
        const endpoint = options.endpoint ?? '/loki/api/v1/push';
        const flushDebounceMs = options.flushDebounceMs ?? 500;
        const maxBatchSize = options.maxBatchSize ?? 100;
        const headers = options.headers ?? {};
        const app = options.app;

        // Buffer: Map<streamKey, LokiEntry[]>
        // streamKey = `app:level` (e.g., "patient-api:error")
        const buffer = new Map<string, LokiEntry[]>();
        let bufferSize = 0;
        const debouncedFlush = debounce(flush, flushDebounceMs, { maxWait: flushDebounceMs * 2 });

        return (logger, level, message, obj) => {
            // Build log line
            const logLine: Record<string, unknown> = {
                logger,
                level,
                message,
                ...obj,
            };

            // Timestamp in nanoseconds
            const ts = `${Date.now()}000000`;

            // Get or create buffer for this stream
            let entries = buffer.get(level);
            if (!entries) {
                entries = [];
                buffer.set(level, entries);
            }

            // Add entry
            entries.push({
                ts,
                line: toJsonString(logLine),
            });

            bufferSize++;

            // Check if we need to flush immediately
            if (bufferSize >= maxBatchSize) {
                // Cancel debounced flush and flush immediately
                debouncedFlush.cancel();
                void flush();
            } else {
                // Schedule debounced flush
                void debouncedFlush();
            }
        };

        async function flush() {
            if (bufferSize === 0) {
                return;
            }

            // Build streams from buffer
            const streams: LokiStream[] = [];
            for (const [level, entries] of buffer.entries()) {
                streams.push({
                    stream: {
                        app,
                        level,
                    },
                    values: entries.map(entry => [entry.ts, entry.line]),
                });
            }

            // Clear buffer before sending (to avoid blocking new logs)
            buffer.clear();
            bufferSize = 0;

            // Build payload
            const payload: LokiPushPayload = { streams };

            // Send to Loki
            try {
                const response = await fetch(`${url}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers,
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    console.error(
                        `[GrafanaLoggerTransport] Failed to push logs to Loki: ${response.status} ${response.statusText}`,
                    );
                }
            } catch (error) {
                console.error('[GrafanaLoggerTransport] Error pushing logs to Loki:', error);
            }
        }
    },
});
