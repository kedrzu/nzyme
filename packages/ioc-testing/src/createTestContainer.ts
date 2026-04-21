import { createContainer } from '@nzyme/ioc/Container.js';
import type { Container } from '@nzyme/ioc/Container.js';
import type { CapturedLog } from '@nzyme/logging/createTestLoggerTransport.js';
import { createTestLoggerTransport } from '@nzyme/logging/createTestLoggerTransport.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';

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
    const container = createContainer();
    const { transport, logs } = createTestLoggerTransport();

    container.set(LoggerTransport, transport);

    return { container, logs };
}
