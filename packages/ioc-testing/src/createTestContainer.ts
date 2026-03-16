import { createContainer } from '@nzyme/ioc/Container.js';
import type { Container } from '@nzyme/ioc/Container.js';
import type { LoggerObject } from '@nzyme/logging/Logger.js';
import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';
import { consoleLog, LoggerTransport } from '@nzyme/logging/LoggerTransport.js';

/** A log entry captured during test execution. */
export interface CapturedLog {
    /** Name of the logger that produced this entry. */
    readonly logger: string | undefined;
    /** Severity level of the log entry. */
    readonly level: LoggerLevel;
    /** Log message text. */
    readonly message: string;
    /** Optional structured data attached to the log entry. */
    readonly data?: LoggerObject | null;
}

/** Result of creating a test container, providing the container and captured logs. */
export interface TestContainerResult {
    /** The IoC container configured for testing. */
    container: Container;
    /** All log entries captured during test execution. */
    logs: CapturedLog[];
}

/**
 * Creates an IoC container configured for integration tests.
 *
 * Features:
 * - Captures logs for test assertions
 * - Pre-configured for test environment
 *
 * @example
 * ```typescript
 * const { container, logs } = createTestContainer();
 * const service = container.resolve(MyService);
 *
 * await service.doSomething();
 *
 * expect(logs.some(l => l.message.includes('expected'))).toBe(true);
 * ```
 */
export function createTestContainer(): TestContainerResult {
    const enabled = process.env.LOGGING === 'true';

    const container = createContainer();
    const logs: CapturedLog[] = [];

    const transport: LoggerTransport = (logger, level, message, obj) => {
        logs.push({ logger, level, message, data: obj });

        if (enabled) {
            consoleLog(logger, level, message, obj);
        }
    };
    container.set(LoggerTransport, transport);

    return { container, logs };
}
