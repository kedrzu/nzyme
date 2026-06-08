import { expect, test } from 'bun:test';

import { createPromise } from './createPromise.js';
import { createSemaphore } from './createSemaphore.js';
import { waitFor } from './waitFor.js';

test('runs the operation and returns its result', async () => {
    const semaphore = createSemaphore(1);
    const result = await semaphore.run(async () => {
        await waitFor(0);
        return 'value';
    });
    expect(result).toBe('value');
});

test('never exceeds the concurrency limit', async () => {
    const limit = 3;
    const semaphore = createSemaphore(limit);

    let running = 0;
    let maxRunning = 0;
    const gates = Array.from({ length: 10 }, () => createPromise());

    const operations = gates.map((gate, index) =>
        semaphore.run(async () => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            await gate.promise;
            running--;
            return index;
        }),
    );

    // Let the semaphore admit the first batch up to the limit.
    await waitFor(0);
    expect(running).toBe(limit);

    // Release every operation and ensure the limit was never breached.
    for (const gate of gates) {
        gate.resolve();
        await waitFor(0);
    }

    const results = await Promise.all(operations);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxRunning).toBe(limit);
});

test('hands a released permit directly to the next waiter in FIFO order', async () => {
    const semaphore = createSemaphore(1);
    const startOrder: number[] = [];
    const gates = [createPromise(), createPromise(), createPromise()];

    const operations = gates.map((gate, index) =>
        semaphore.run(async () => {
            startOrder.push(index);
            await gate.promise;
        }),
    );

    await waitFor(0);
    expect(startOrder).toEqual([0]);

    gates[0]!.resolve();
    await waitFor(0);
    expect(startOrder).toEqual([0, 1]);

    gates[1]!.resolve();
    await waitFor(0);
    expect(startOrder).toEqual([0, 1, 2]);

    gates[2]!.resolve();
    await Promise.all(operations);
});

test('releases the permit when the operation throws', async () => {
    const semaphore = createSemaphore(1);

    await expect(
        semaphore.run(async () => {
            await waitFor(0);
            throw new Error('boom');
        }),
    ).rejects.toThrow('boom');

    // A subsequent operation must still acquire a permit (no leak).
    const result = await semaphore.run(async () => 'recovered');
    expect(result).toBe('recovered');
});

test('throws for a non-positive or non-finite limit', () => {
    expect(() => createSemaphore(0)).toThrow();
    expect(() => createSemaphore(-1)).toThrow();
    expect(() => createSemaphore(Number.NaN)).toThrow();
    expect(() => createSemaphore(Number.POSITIVE_INFINITY)).toThrow();
});
