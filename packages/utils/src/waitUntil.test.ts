import { expect, test } from 'bun:test';

import { TimeoutError } from './TimeoutError.js';
import { waitFor } from './waitFor.js';
import { waitUntil } from './waitUntil.js';

test('resolves without waiting when the condition already holds', async () => {
    let checks = 0;
    const started = Date.now();

    await waitUntil(
        () => {
            checks++;
            return true;
        },
        { intervalMs: 1000 },
    );

    expect(checks).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
});

test('polls until the condition holds', async () => {
    let ready = false;
    setTimeout(() => (ready = true), 30);

    await waitUntil(() => ready, { intervalMs: 5 });

    expect(ready).toBe(true);
});

test('judges an async condition by what it resolves to, not by being a promise', async () => {
    let ready = false;
    setTimeout(() => (ready = true), 30);

    await waitUntil(
        async () => {
            await waitFor(0);
            return ready;
        },
        { intervalMs: 5 },
    );

    expect(ready).toBe(true);
});

test('rejects with TimeoutError when the deadline elapses', async () => {
    const promise = waitUntil(() => false, { intervalMs: 5, timeoutMs: 20 });

    await expect(promise).rejects.toThrow(TimeoutError);
});

test('rejects with the caller-chosen error from onTimeout', async () => {
    const promise = waitUntil(() => false, {
        intervalMs: 5,
        timeoutMs: 20,
        onTimeout: () => {
            throw new Error('never became ready');
        },
    });

    await expect(promise).rejects.toThrow('never became ready');
});

test('gives up quietly when onTimeout returns', async () => {
    await waitUntil(() => false, { intervalMs: 5, timeoutMs: 20, onTimeout: () => {} });
});

test('stops polling once the deadline has elapsed', async () => {
    let checks = 0;

    await waitUntil(
        () => {
            checks++;
            return false;
        },
        { intervalMs: 5, timeoutMs: 20, onTimeout: () => {} },
    );

    const checksAtDeadline = checks;

    // The old implementation left a setInterval running forever; the loop must observe the
    // abort and stop within one interval instead.
    await waitFor(40);
    expect(checks).toBeLessThanOrEqual(checksAtDeadline + 1);
});

test('propagates a rejection from the condition', async () => {
    const promise = waitUntil(
        () => {
            throw new Error('condition blew up');
        },
        { intervalMs: 5, timeoutMs: 100 },
    );

    await expect(promise).rejects.toThrow('condition blew up');
});
