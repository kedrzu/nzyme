import { createContainer } from '@nzyme/ioc';
import type { Container } from '@nzyme/ioc';
import type { LoggerLevel, LoggerObject } from '@nzyme/logging';
import { consoleLog, LoggerTransport } from '@nzyme/logging';

export interface CapturedLog {
    readonly logger: string | undefined;
    readonly level: LoggerLevel;
    readonly message: string;
    readonly data?: LoggerObject | null;
}

export interface TestContainerOptions {
    /** Capture logs for assertions. Defaults to true. */
    captureLogs?: boolean;
}

export interface TestContainerResult {
    container: Container;
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
export function createTestContainer(options: TestContainerOptions = {}): TestContainerResult {
    const { captureLogs = true } = options;

    const container = createContainer();
    const logs: CapturedLog[] = [];

    if (captureLogs) {
        const transport: LoggerTransport = (logger, level, message, obj) => {
            logs.push({ logger, level, message, data: obj });
            consoleLog(logger, level, message, obj);
        };
        container.set(LoggerTransport, transport);
    }

    return { container, logs };
}
