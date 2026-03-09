import type { Logger, LoggerObject } from './Logger.js';
import type { LoggerTransport } from './LoggerTransport.js';
import { consoleLog } from './LoggerTransport.js';

let globalTransport: LoggerTransport = consoleLog;

/**
 * Set the global logger transport used by {@link createLogger}.
 */
export function setLoggerTransport(transport: LoggerTransport): void {
    globalTransport = transport;
}

/**
 * Create a logger instance using the globally configured transport.
 */
export function createLogger(name: string): Logger {
    return {
        name,
        error: (msg: string, obj?: LoggerObject) => globalTransport(name, 'error', msg, obj),
        warn: (msg: string, obj?: LoggerObject) => globalTransport(name, 'warn', msg, obj),
        info: (msg: string, obj?: LoggerObject) => globalTransport(name, 'info', msg, obj),
        debug: (msg: string, obj?: LoggerObject) => globalTransport(name, 'debug', msg, obj),
        trace: (msg: string, obj?: LoggerObject) => globalTransport(name, 'trace', msg, obj),
    };
}
