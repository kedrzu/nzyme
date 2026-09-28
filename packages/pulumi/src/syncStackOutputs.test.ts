import { afterEach, expect, spyOn, test } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import type { SomeObject } from '@nzyme/types/Object.js';

import type { Stack, StackOptions } from './defineStack.js';
import { defineStack } from './defineStack.js';
import { syncStackOutputs } from './syncStackOutputs.js';

type TestOutput = { url: string };
type TestHooks = Pick<StackOptions<SomeObject, TestOutput>, 'outputs'>;

const SECRET = 'db-root-password-s3cr3t';

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
    // Console/stdout spies are restored per test so a failing assertion cannot leak one.
    for (const spy of spies) {
        spy.mockRestore();
    }
    spies.length = 0;
});

/**
 * A real stack whose every non-`outputs` hook records its call, so a test can prove they never run.
 */
function resolveTestStack(name: string, calls: string[], hooks: TestHooks = {}) {
    const definition = defineStack<SomeObject, TestOutput>({
        name,
        resources: () => ({ url: 'unused' }),
        build: () => {
            calls.push(`${name}:build`);
        },
        beforeDeploy: () => {
            calls.push(`${name}:beforeDeploy`);
        },
        afterDeploy: () => {
            calls.push(`${name}:afterDeploy`);
        },
        outputs: hooks.outputs ?? (() => void calls.push(`${name}:outputs`)),
    });

    return createContainer().resolve(definition);
}

test('syncStackOutputs runs only the outputs hook of each stack, with its deployed outputs', async () => {
    const calls: string[] = [];
    const received: Array<{ stack: string; output: TestOutput }> = [];
    const stacks = ['core', 'api'].map(name =>
        resolveTestStack(name, calls, {
            outputs: output => {
                calls.push(`${name}:outputs`);
                received.push({ stack: name, output });
            },
        }),
    );

    const report = await syncStackOutputs({
        stacks,
        fetchOutputs: stack => Promise.resolve({ url: `https://${stack.name}.example.com` }),
    });

    expect(calls).toEqual(['core:outputs', 'api:outputs']);
    expect(received).toEqual([
        { stack: 'core', output: { url: 'https://core.example.com' } },
        { stack: 'api', output: { url: 'https://api.example.com' } },
    ]);
    expect(report.synced).toEqual(stacks);
    expect(report.missing).toEqual([]);
    expect(report.fetchFailures).toEqual([]);
    expect(report.hookFailures).toEqual([]);
});

test('syncStackOutputs skips a stack missing from the backend and still syncs the rest', async () => {
    const calls: string[] = [];
    const missing = resolveTestStack('missing', calls);
    const deployed = resolveTestStack('deployed', calls);

    const report = await syncStackOutputs({
        stacks: [missing, deployed],
        fetchOutputs: stack => Promise.resolve(stack === missing ? null : { url: 'https://deployed.example.com' }),
    });

    expect(calls).toEqual(['deployed:outputs']);
    expect(report.missing).toEqual([missing]);
    expect(report.synced).toEqual([deployed]);
    expect(report.fetchFailures).toEqual([]);
    expect(report.hookFailures).toEqual([]);
});

test('syncStackOutputs reports fetch and hook failures separately without stopping other stacks', async () => {
    const calls: string[] = [];
    const fetchError = new Error('backend unreachable');
    const hookError = new Error('cannot write config');
    const unfetchable = resolveTestStack('unfetchable', calls);
    const failingHook = resolveTestStack('failing-hook', calls, {
        outputs: () => {
            throw hookError;
        },
    });
    const healthy = resolveTestStack('healthy', calls);

    const report = await syncStackOutputs({
        stacks: [unfetchable, failingHook, healthy],
        fetchOutputs: stack =>
            stack === unfetchable ? Promise.reject(fetchError) : Promise.resolve({ url: 'https://example.com' }),
    });

    expect(calls).toEqual(['healthy:outputs']);
    expect(report.fetchFailures).toEqual([{ stack: unfetchable, error: fetchError }]);
    expect(report.hookFailures).toEqual([{ stack: failingHook, error: hookError }]);
    expect(report.synced).toEqual([healthy]);
    expect(report.missing).toEqual([]);
});

test('syncStackOutputs runs hooks one at a time in stack order, even when fetches finish out of order', async () => {
    const events: string[] = [];
    const makeHook = (name: string) => async () => {
        events.push(`${name}:start`);
        await Bun.sleep(1);
        events.push(`${name}:end`);
    };
    const stacks = ['first', 'second', 'third'].map(name => resolveTestStack(name, [], { outputs: makeHook(name) }));
    // The first stack's fetch is the slowest, so parallel fetches complete in reverse order.
    const fetchDelays = new Map<Stack, number>(stacks.map((stack, i) => [stack, (stacks.length - i) * 5]));

    await syncStackOutputs({
        stacks,
        fetchOutputs: async stack => {
            await Bun.sleep(fetchDelays.get(stack) ?? 0);
            return { url: 'https://example.com' };
        },
    });

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end', 'third:start', 'third:end']);
});

test('syncStackOutputs writes no output value to stdout or the console', async () => {
    const written: string[] = [];
    const record = (...args: unknown[]) => {
        written.push(args.map(String).join(' '));
    };
    spies.push(
        spyOn(console, 'log').mockImplementation(record),
        spyOn(console, 'info').mockImplementation(record),
        spyOn(console, 'warn').mockImplementation(record),
        spyOn(console, 'error').mockImplementation(record),
        spyOn(process.stdout, 'write').mockImplementation(chunk => {
            record(chunk);
            return true;
        }),
    );
    const calls: string[] = [];

    const report = await syncStackOutputs({
        stacks: [resolveTestStack('database', calls)],
        fetchOutputs: () => Promise.resolve({ url: 'https://db.example.com', rootPassword: SECRET }),
    });

    expect(calls).toEqual(['database:outputs']);
    expect(report.synced).toHaveLength(1);
    expect(written.join('\n')).not.toContain(SECRET);
});
