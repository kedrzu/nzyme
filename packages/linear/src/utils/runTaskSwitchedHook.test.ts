import { expect, test } from 'bun:test';

import type { Logger, LoggerObject } from '@nzyme/logging/Logger.js';

import type { TaskSwitchedInfo } from '../cli/TaskSwitchedInfo.js';
import { runTaskSwitchedHook } from './runTaskSwitchedHook.js';

test('calls the hook with the task details', async () => {
    const calls: TaskSwitchedInfo[] = [];
    const task = createTask();

    await runTaskSwitchedHook(info => {
        calls.push(info);
    }, task);

    expect(calls).toEqual([task]);
});

test('awaits an asynchronous hook before returning', async () => {
    let finished = false;
    const task = createTask();

    await runTaskSwitchedHook(async () => {
        await Promise.resolve();
        finished = true;
    }, task);

    expect(finished).toBe(true);
});

test('warns instead of throwing when the hook rejects', async () => {
    const warnings: { msg: string; obj: LoggerObject | undefined }[] = [];
    const error = new Error('daemon unreachable');
    const task = createTask({ warn: (msg, obj) => warnings.push({ msg, obj }) });

    await runTaskSwitchedHook(() => Promise.reject(error), task);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.msg).toContain('SIG-123');
    expect(warnings[0]?.obj).toEqual({ error });
});

test('warns instead of throwing when the hook throws synchronously', async () => {
    const warnings: string[] = [];
    const task = createTask({ warn: msg => warnings.push(msg) });

    await runTaskSwitchedHook(() => {
        throw new Error('boom');
    }, task);

    expect(warnings).toHaveLength(1);
});

test('does nothing when no hook is configured', async () => {
    const logs: string[] = [];
    const task = createTask({
        warn: msg => logs.push(msg),
        info: msg => logs.push(msg),
        error: msg => logs.push(msg),
    });

    await runTaskSwitchedHook(undefined, task);

    expect(logs).toEqual([]);
});

function createTask(logger?: Partial<Logger>): TaskSwitchedInfo {
    return {
        issueId: 'SIG-123',
        title: 'Some Linear title',
        logger: {
            name: 'test',
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {},
            ...logger,
        },
    };
}
