import { createExponentialBackoff } from '@nzyme/utils/createExponentialBackoff.js';
import { toJsonString } from '@nzyme/utils/toJsonString.js';

import { ApplicationError } from './ApplicationError.js';
import type { LoggerObject } from './Logger.js';
import type { LoggerLevel } from './LoggerLevel.js';
import type { LoggerTransport } from './LoggerTransport.js';

/**
 * A log entry sent over WebSocket.
 */
export interface WebsocketLogEntry {
    /** Unique identifier for the log entry */
    id: string;
    /** Unix timestamp in milliseconds */
    timestamp: number;
    /** App identifier */
    app: string;
    /** Logger name (service name) */
    logger: string | null;
    /** Log level */
    level: LoggerLevel;
    /** Log message */
    message: string;
    /** Additional structured data */
    data?: Record<string, unknown>;
}

/**
 * Options for creating a WebSocket logger transport.
 */
export interface WebsocketLoggerTransportOptions {
    /** WebSocket URL (e.g., 'ws://localhost:3012/ingest') */
    url: string;
    /** App identifier for log source */
    app: string;
    /** Fallback transport when WebSocket is disconnected */
    fallback?: LoggerTransport;
    /** Max buffered messages when disconnected. Default: 100 */
    bufferSize?: number;
}

/**
 * Creates a logger transport that sends logs over WebSocket.
 *
 * Features:
 * - Sends logs to a WebSocket server for centralized viewing
 * - Falls back to a provided transport when disconnected
 * - Buffers logs when disconnected and flushes on reconnect
 * - Auto-reconnects with exponential backoff
 *
 * @example
 * ```typescript
 * const transport = createWebsocketLoggerTransport({
 *   url: 'ws://localhost:3012/ingest',
 *   app: 'api',
 *   fallback: PrettyCliLoggerTransport.create(),
 *   bufferSize: 100,
 * });
 *
 * container.set(LoggerTransport, transport);
 * ```
 *
 * @param options - Transport configuration
 * @returns A LoggerTransport function
 */
export function createWebsocketLoggerTransport(options: WebsocketLoggerTransportOptions): LoggerTransport {
    const { url, app, fallback, bufferSize = 100 } = options;

    let ws: WebSocket | null = null;
    let connected = false;
    let connecting = false;
    const buffer: WebsocketLogEntry[] = [];
    const backoff = createExponentialBackoff({
        maxRetries: Infinity, // Never give up on reconnecting
        baseDelay: 1000,
        power: 2,
        maxDelay: 30000,
    });

    connect();

    return transport;

    function transport(
        logger: string | undefined,
        level: LoggerLevel,
        message: string,
        obj?: LoggerObject | null,
    ): void {
        // Always call fallback if provided (for CLI output)
        fallback?.(logger, level, message, obj);

        const entry = createLogEntry(logger, level, message, obj);

        if (connected && ws?.readyState === WebSocket.OPEN) {
            sendLog(entry);
        } else {
            bufferLog(entry);
        }
    }

    function createLogEntry(
        logger: string | undefined,
        level: LoggerLevel,
        message: string,
        obj?: LoggerObject | null,
    ): WebsocketLogEntry {
        // Extract error and convert to serializable format
        let data: Record<string, unknown> | undefined;
        if (obj) {
            const { error, ...rest } = obj;
            if (Object.keys(rest).length > 0 || error !== undefined) {
                data = { ...rest };
                if (error instanceof Error) {
                    data.error = serializeError(error);
                } else if (error !== undefined) {
                    data.error = error;
                }
            }
        }

        return {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            app,
            logger: logger ?? null,
            level,
            message,
            data,
        };
    }

    function sendLog(entry: WebsocketLogEntry): void {
        const message = toJsonString(entry);
        try {
            ws?.send(message);
        } catch {
            // If send fails, buffer the log
            bufferLog(entry);
        }
    }

    function bufferLog(entry: WebsocketLogEntry): void {
        buffer.push(entry);
        // Keep buffer at max size (circular buffer behavior)
        while (buffer.length > bufferSize) {
            buffer.shift();
        }
    }

    function flushBuffer(): void {
        while (buffer.length > 0) {
            const entry = buffer.shift()!;
            sendLog(entry);
        }
    }

    function connect(): void {
        if (connecting || connected) {
            return;
        }

        connecting = true;

        try {
            ws = new WebSocket(url);

            ws.addEventListener('open', () => {
                connected = true;
                connecting = false;
                backoff.reset();
                flushBuffer();
            });

            ws.addEventListener('close', () => {
                connected = false;
                connecting = false;
                ws = null;
                scheduleReconnect();
            });

            ws.addEventListener('error', () => {
                // Error will be followed by close event
            });
        } catch {
            connecting = false;
            scheduleReconnect();
        }
    }

    function scheduleReconnect(): void {
        if (backoff.canRetry()) {
            void backoff.backoff().then(connect);
        }
    }
}

/**
 * Serializes an error to a plain object for JSON transmission.
 * Handles ApplicationError's additional data, AggregateError's errors array, and nested causes.
 */
function serializeError(error: Error, depth = 0): Record<string, unknown> {
    const maxDepth = 5;

    const result: Record<string, unknown> = {
        name: error.name,
        message: error.message,
        stack: error.stack,
    };

    // Handle AggregateError's errors array
    if (error instanceof AggregateError && error.errors && depth < maxDepth) {
        result.errors = error.errors.map(err => {
            if (err instanceof Error) {
                return serializeError(err, depth + 1);
            }
            return err as unknown;
        });
    }

    // Include ApplicationError's additional data
    if (error instanceof ApplicationError) {
        const { logger, cause: _cause, ...data } = error.data;
        // Add logger name if present
        if (logger) {
            result.loggerName = logger.name;
        }
        // Merge additional data into result
        for (const [key, value] of Object.entries(data)) {
            if (key !== 'name' && key !== 'message' && key !== 'stack' && key !== 'errors') {
                result[key] = value;
            }
        }
    }

    // Serialize cause recursively
    if (error.cause && depth < maxDepth) {
        if (error.cause instanceof Error) {
            result.cause = serializeError(error.cause, depth + 1);
        } else {
            result.cause = error.cause;
        }
    }

    return result;
}
