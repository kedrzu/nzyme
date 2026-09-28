import { afterEach, expect, spyOn, test } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import type { Container } from '@nzyme/ioc/Container.js';
import { createTestLoggerTransport } from '@nzyme/logging/createTestLoggerTransport.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';
import type { SomeObject } from '@nzyme/types/Object.js';

import type { StackOptions } from './defineStack.js';
import { defineStack } from './defineStack.js';
import { printStackOutputs } from './printStackOutputs.js';

type TestOutput = { url: string };
type TestHooks = Pick<StackOptions<SomeObject, TestOutput>, 'afterDeploy' | 'build' | 'outputs'>;

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
    // Console spies are restored per test so a failing assertion cannot leak one.
    for (const spy of spies) {
        spy.mockRestore();
    }
    spies.length = 0;
});

/**
 * A container whose stacks' loggers are captured into `logs`, so a test can assert on warnings
 * without a stack falling back to the default console transport.
 */
function createLoggingContainer() {
    const container = createContainer();
    const { transport, logs } = createTestLoggerTransport();
    container.set(LoggerTransport, transport);
    return { container, logs };
}

/**
 * A real stack whose `build`, `afterDeploy` and `outputs` hooks record their call, so a test can prove
 * `printStackOutputs` never runs any of them.
 */
function resolveTestStack(container: Container, name: string, calls: string[], hooks: TestHooks = {}) {
    const definition = defineStack<SomeObject, TestOutput>({
        name,
        resources: () => ({ url: 'unused' }),
        build: hooks.build ?? (() => void calls.push(`${name}:build`)),
        afterDeploy: hooks.afterDeploy ?? (() => void calls.push(`${name}:afterDeploy`)),
        outputs: hooks.outputs ?? (() => void calls.push(`${name}:outputs`)),
    });

    return container.resolve(definition);
}

test('printStackOutputs prints a deployed stack and warns and skips one that is not deployed', async () => {
    const { container, logs } = createLoggingContainer();
    const calls: string[] = [];
    const printed: string[] = [];
    spies.push(
        spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            printed.push(args.map(String).join(' '));
        }),
    );
    const missing = resolveTestStack(container, 'missing', calls);
    const deployed = resolveTestStack(container, 'deployed', calls);

    await printStackOutputs({
        stacks: [missing, deployed],
        fetchOutputs: stack => Promise.resolve(stack === missing ? null : { url: 'https://deployed.example.com' }),
    });

    const output = printed.join('\n');
    expect(output).toContain('https://deployed.example.com');
    expect(output).not.toContain('missing');
    expect(
        logs.some(l => l.level === 'warn' && l.message.includes('missing') && l.message.includes('not deployed')),
    ).toBe(true);
});

test('printStackOutputs runs no outputs, afterDeploy or build hook', async () => {
    const { container } = createLoggingContainer();
    const calls: string[] = [];
    const stack = resolveTestStack(container, 'core', calls);
    spies.push(spyOn(console, 'log').mockImplementation(() => {}));

    await printStackOutputs({
        stacks: [stack],
        fetchOutputs: () => Promise.resolve({ url: 'https://core.example.com' }),
    });

    expect(calls).toEqual([]);
});
