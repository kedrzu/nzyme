import { expect, test } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import { createTestLoggerTransport } from '@nzyme/logging/createTestLoggerTransport.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';
import type { SomeObject } from '@nzyme/types/Object.js';

import { defineStack } from './defineStack.js';
import { logSyncStackOutputsReport } from './logSyncStackOutputsReport.js';
import { syncStackOutputs } from './syncStackOutputs.js';

type TestOutput = { url: string; rootPassword?: string };

const SECRET = 'db-root-password-s3cr3t';

/**
 * A container whose stacks' loggers are captured into `logs`, so a test can assert on log content
 * without a stack falling back to the default console transport.
 */
function createLoggingContainer() {
    const container = createContainer();
    const { transport, logs } = createTestLoggerTransport();
    container.set(LoggerTransport, transport);
    return { container, logs };
}

function resolveTestStack(container: ReturnType<typeof createContainer>, name: string, outputsHook?: () => void) {
    const definition = defineStack<SomeObject, TestOutput>({
        name,
        resources: () => ({ url: 'unused' }),
        outputs: outputsHook,
    });

    return container.resolve(definition);
}

test('logSyncStackOutputsReport reports failure and logs only names and errors, for both a fetch and a hook failure', async () => {
    const { container, logs } = createLoggingContainer();
    const fetchError = new Error('backend unreachable');
    const hookError = new Error('cannot write config');
    const missing = resolveTestStack(container, 'missing');
    const unfetchable = resolveTestStack(container, 'unfetchable');
    const failingHook = resolveTestStack(container, 'failing-hook', () => {
        throw hookError;
    });
    const synced = resolveTestStack(container, 'synced');

    const report = await syncStackOutputs({
        stacks: [missing, unfetchable, failingHook, synced],
        fetchOutputs: stack => {
            if (stack === missing) {
                return Promise.resolve(null);
            }
            if (stack === unfetchable) {
                return Promise.reject(fetchError);
            }
            return Promise.resolve({ url: 'https://example.com', rootPassword: SECRET });
        },
    });

    const failed = logSyncStackOutputsReport(report);

    expect(failed).toBe(true);
    expect(logs.some(l => l.level === 'warn' && l.message.includes('missing'))).toBe(true);
    expect(
        logs.some(l => l.level === 'error' && l.message.includes('unfetchable') && l.data?.error === fetchError),
    ).toBe(true);
    expect(
        logs.some(l => l.level === 'error' && l.message.includes('failing-hook') && l.data?.error === hookError),
    ).toBe(true);
    expect(logs.some(l => l.level === 'info' && l.message.includes('synced'))).toBe(true);
    expect(logs.map(l => l.message).join('\n')).not.toContain(SECRET);
});

test('logSyncStackOutputsReport reports success when there are only synced and missing stacks', async () => {
    const { container } = createLoggingContainer();
    const missing = resolveTestStack(container, 'missing');
    const synced = resolveTestStack(container, 'synced');

    const report = await syncStackOutputs({
        stacks: [missing, synced],
        fetchOutputs: stack => Promise.resolve(stack === missing ? null : { url: 'https://example.com' }),
    });

    expect(logSyncStackOutputsReport(report)).toBe(false);
});
