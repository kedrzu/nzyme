import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';

/**
 * A log entry displayed in the log viewer.
 */
export interface LogEntry {
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
