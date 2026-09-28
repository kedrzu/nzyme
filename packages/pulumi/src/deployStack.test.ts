import { expect, test } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import type { SomeObject } from '@nzyme/types/Object.js';
import { createPromise } from '@nzyme/utils/createPromise.js';
import { createSemaphore } from '@nzyme/utils/createSemaphore.js';

import type { StackOptions } from './defineStack.js';
import { defineStack } from './defineStack.js';
import { completeStackDeploy } from './deployStack.js';

// `deployStack` ends with a single `completeStackDeploy` call after the `up` / `--skip-resources`
// branch, so both branches get exactly the behaviour pinned here without running Pulumi.

type TestOutput = { url: string };
type TestHooks = Pick<StackOptions<SomeObject, TestOutput>, 'outputs' | 'afterDeploy'>;

function resolveTestStack(name: string, hooks: TestHooks) {
    const definition = defineStack<SomeObject, TestOutput>({
        name,
        resources: () => ({ url: 'unused' }),
        ...hooks,
    });

    return createContainer().resolve(definition);
}

test('completeStackDeploy runs the outputs hook once, then afterDeploy once, with the same outputs', async () => {
    const calls: Array<{ hook: string; output: TestOutput }> = [];
    const stack = resolveTestStack('api', {
        outputs: output => {
            calls.push({ hook: 'outputs', output });
        },
        afterDeploy: output => {
            calls.push({ hook: 'afterDeploy', output });
        },
    });
    const output = { url: 'https://api.example.com' };

    await completeStackDeploy(stack, { output, outputsLock: createSemaphore(1) });

    expect(calls.map(call => call.hook)).toEqual(['outputs', 'afterDeploy']);
    expect(calls[0]!.output).toBe(output);
    expect(calls[1]!.output).toBe(output);
});

test('completeStackDeploy never overlaps outputs hooks of concurrently deployed stacks', async () => {
    const events: string[] = [];
    // The first hook parks until released a macrotask later; by then every pending microtask has run,
    // so without the lock the second hook would already have started inside the first one.
    const release = createPromise();
    const first = resolveTestStack('first', {
        outputs: async () => {
            events.push('first:start');
            await release.promise;
            events.push('first:end');
        },
    });
    const second = resolveTestStack('second', {
        outputs: () => {
            events.push('second:start');
            events.push('second:end');
        },
    });
    const outputsLock = createSemaphore(1);
    const output = { url: 'https://api.example.com' };

    const deploys = Promise.all([
        completeStackDeploy(first, { output, outputsLock }),
        completeStackDeploy(second, { output, outputsLock }),
    ]);
    await Bun.sleep(0);
    release.resolve();
    await deploys;

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
});

test('completeStackDeploy propagates an outputs hook failure, skips afterDeploy, and frees the lock', async () => {
    const afterDeployed: string[] = [];
    const failing = resolveTestStack('failing', {
        outputs: () => {
            throw new Error('cannot write config');
        },
        afterDeploy: () => {
            afterDeployed.push('failing');
        },
    });
    const next = resolveTestStack('next', {
        afterDeploy: () => {
            afterDeployed.push('next');
        },
    });
    const outputsLock = createSemaphore(1);
    const output = { url: 'https://api.example.com' };

    await expect(completeStackDeploy(failing, { output, outputsLock })).rejects.toThrow('cannot write config');
    await completeStackDeploy(next, { output, outputsLock });

    expect(afterDeployed).toEqual(['next']);
});
