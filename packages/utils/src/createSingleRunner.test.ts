import { expect, test } from 'bun:test';

import { createSingleRunner } from './createSingleRunner.js';
import type { SingleRunnerState } from './createSingleRunner.js';
import { waitFor } from './waitFor.js';

test('should execute handler and update running state', async () => {
    let executionCount = 0;
    const handler = async () => {
        executionCount++;
        await waitFor(0);
        return 'result';
    };

    const runner = createSingleRunner({ handler });

    expect(runner.running).toBe(false);
    expect(runner.promise).toBeUndefined();
    expect(runner.error).toBeUndefined();

    const resultPromise = runner.execute();
    expect(runner.running).toBe(true);
    expect(runner.promise).toBeDefined();

    const result = await resultPromise;
    expect(result).toBe('result');
    expect(runner.running).toBe(false);
    expect(runner.promise).toBeUndefined();
    expect(executionCount).toBe(1);
});

test('should prevent concurrent executions', async () => {
    let executionCount = 0;
    let resolveHandler: ((value: string) => void) | undefined;

    const handler = async () => {
        executionCount++;
        return await new Promise<string>(resolve => {
            resolveHandler = resolve;
        });
    };

    const runner = createSingleRunner({ handler });

    // Start first execution
    const promise1 = runner.execute();
    expect(runner.running).toBe(true);
    expect(executionCount).toBe(1);

    // Try to start second execution
    const promise2 = runner.execute();
    expect(runner.running).toBe(true);
    expect(executionCount).toBe(1); // Should not increment

    // Both promises should be the same
    expect(promise1).toBe(promise2);

    // Resolve the handler
    resolveHandler!('result');

    const result1 = await promise1;
    const result2 = await promise2;

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(runner.running).toBe(false);
    expect(executionCount).toBe(1);
});

test('should allow retry after error', async () => {
    let attemptCount = 0;
    const handler = async () => {
        attemptCount++;
        if (attemptCount === 1) {
            throw new Error('first attempt failed');
        }
        await waitFor(0);
        return 'success';
    };

    const runner = createSingleRunner({ handler });

    // First attempt should fail
    await runner.execute().catch(() => {});
    expect(runner.error).toBeInstanceOf(Error);
    expect((runner.error as Error).message).toBe('first attempt failed');
    expect(runner.error).toBeDefined();
    expect(runner.running).toBe(false);

    // Second attempt should succeed
    const result = await runner.execute();
    expect(result).toBe('success');
    expect(runner.error).toBeUndefined();
    expect(runner.running).toBe(false);
    expect(attemptCount).toBe(2);
});

test('should work with provided initial state', async () => {
    const handler = async () => {
        await waitFor(0);
        return 'result';
    };

    let calledState = false;
    let savedState: SingleRunnerState<string> | undefined;

    const runner = createSingleRunner({
        handler,
        state: state => {
            calledState = true;
            savedState = { ...state };
            return savedState;
        },
    });

    // Initial state should be updated with execute method
    expect(calledState).toBe(true);
    expect(savedState).toBeDefined();
    expect(runner).toBe(savedState!);

    const result = await runner.execute();
    expect(result).toBe('result');
    expect(savedState?.running).toBe(false);
    expect(savedState?.promise).toBeUndefined();
    expect(savedState?.error).toBeUndefined();
});

test('should clear error on successful execution after failure', async () => {
    let shouldFail = true;
    const handler = async () => {
        if (shouldFail) {
            throw new Error('error');
        }
        await waitFor(0);
        return 'success';
    };

    const runner = createSingleRunner({ handler });

    // First execution fails
    await runner.execute().catch(() => {});
    expect(runner.error).toBeDefined();

    // Second execution succeeds
    shouldFail = false;
    const result = await runner.execute();
    expect(result).toBe('success');
    expect(runner.error).toBeUndefined();
});

test('reset() clears state so next execute starts a fresh handler invocation', async () => {
    let executionCount = 0;
    const resolvers: ((value: string) => void)[] = [];

    const handler = async () => {
        executionCount++;
        return await new Promise<string>(resolve => {
            resolvers.push(resolve);
        });
    };

    const runner = createSingleRunner({ handler });

    // Start first execution — it will stay pending until we resolve it.
    const promise1 = runner.execute();
    expect(runner.running).toBe(true);
    expect(runner.promise).toBeDefined();
    expect(executionCount).toBe(1);

    // Reset while the first handler is still in-flight.
    runner.reset();
    expect(runner.running).toBe(false);
    expect(runner.promise).toBeUndefined();
    expect(runner.error).toBeUndefined();

    // The next execute() should start a brand new handler invocation rather
    // than deduplicating into the stale promise.
    const promise2 = runner.execute();
    expect(promise2).not.toBe(promise1);
    expect(executionCount).toBe(2);

    // Resolving the stale handler must not clobber the new state.
    resolvers[0]('stale');
    await promise1;
    expect(runner.running).toBe(true);
    expect(runner.promise).toBe(promise2);

    // Resolve the new handler and confirm normal state-clearing still works.
    resolvers[1]('fresh');
    const result = await promise2;
    expect(result).toBe('fresh');
    expect(runner.running).toBe(false);
    expect(runner.promise).toBeUndefined();
});

test('reset() clears any captured error', async () => {
    const handler = async () => {
        throw new Error('boom');
    };

    const runner = createSingleRunner({ handler });

    await runner.execute().catch(() => {});
    expect(runner.error).toBeInstanceOf(Error);

    runner.reset();
    expect(runner.error).toBeUndefined();
    expect(runner.running).toBe(false);
    expect(runner.promise).toBeUndefined();
});

test('should maintain single execution during concurrent calls with delay', async () => {
    let executionCount = 0;

    const handler = async () => {
        executionCount++;
        await waitFor(50);
        return `result-${executionCount}`;
    };

    const runner = createSingleRunner({ handler });

    // Start multiple concurrent executions
    const promises = [runner.execute(), runner.execute(), runner.execute()];

    const results = await Promise.all(promises);

    // All should get the same result from single execution
    expect(results[0]).toBe('result-1');
    expect(results[1]).toBe('result-1');
    expect(results[2]).toBe('result-1');
    expect(executionCount).toBe(1);
});
