import { afterEach, beforeEach, expect, jest, test } from 'bun:test';

import { createPromise } from './createPromise.js';
import { TimeoutError } from './TimeoutError.js';
import { withTimeout } from './withTimeout.js';

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

test('resolves with the operation result when it settles before the deadline', async () => {
    const result = await withTimeout({
        operation: Promise.resolve('value'),
        timeoutMs: 1000,
    });

    expect(result).toBe('value');
});

test('rejects with the operation own error, not a wrapped one', async () => {
    const failure = new Error('operation failed');

    const error = await withTimeout({
        operation: Promise.reject(failure),
        timeoutMs: 1000,
    }).catch((rejectionReason: unknown) => rejectionReason);

    expect(error).toBe(failure);
});

test('rejects with a TimeoutError carrying the deadline when onTimeout is omitted', async () => {
    const pending = createPromise<string>();

    const promise = withTimeout({
        operation: pending.promise,
        timeoutMs: 250,
    });

    jest.advanceTimersByTime(250);

    const error = await promise.catch((timeoutError: unknown) => timeoutError);

    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).timeoutMs).toBe(250);
});

test('resolves with the value returned by onTimeout', async () => {
    const pending = createPromise<string>();

    const promise = withTimeout({
        operation: pending.promise,
        timeoutMs: 100,
        onTimeout: () => 'fallback',
    });

    jest.advanceTimersByTime(100);

    expect(await promise).toBe('fallback');
});

test('awaits a promise returned by onTimeout', async () => {
    const pending = createPromise<string>();

    const promise = withTimeout({
        operation: pending.promise,
        timeoutMs: 100,
        onTimeout: () => Promise.resolve('async fallback'),
    });

    jest.advanceTimersByTime(100);

    expect(await promise).toBe('async fallback');
});

test('rejects with the exact error thrown by onTimeout', async () => {
    const pending = createPromise<string>();
    const failure = new Error('domain specific timeout');

    const promise = withTimeout({
        operation: pending.promise,
        timeoutMs: 100,
        onTimeout: () => {
            throw failure;
        },
    });

    jest.advanceTimersByTime(100);

    const error = await promise.catch((onTimeoutError: unknown) => onTimeoutError);

    expect(error).toBe(failure);
});

test('aborts the operation signal with a TimeoutError reason', async () => {
    let operationSignal: AbortSignal | undefined;

    const promise = withTimeout({
        operation: signal => {
            operationSignal = signal;
            return createPromise().promise;
        },
        timeoutMs: 100,
        onTimeout: () => {},
    });

    expect(operationSignal?.aborted).toBe(false);

    jest.advanceTimersByTime(100);
    await promise;

    expect(operationSignal?.aborted).toBe(true);
    expect(operationSignal?.reason).toBeInstanceOf(TimeoutError);
});

test('keeps the onTimeout outcome when aborting rejects the operation synchronously', async () => {
    // fetch and the AWS SDK reject synchronously from inside abort(); a Promise.race would
    // surface that rejection instead of the timeout outcome.
    const pending = createPromise<string>();

    const promise = withTimeout({
        operation: signal => {
            signal.addEventListener('abort', () => pending.reject(new Error('aborted')));
            return pending.promise;
        },
        timeoutMs: 100,
        onTimeout: () => 'timeout outcome',
    });

    jest.advanceTimersByTime(100);

    expect(await promise).toBe('timeout outcome');
});

test('ignores a late resolution of the abandoned operation', async () => {
    const pending = createPromise<string>();

    const promise = withTimeout({
        operation: pending.promise,
        timeoutMs: 100,
        onTimeout: () => 'fallback',
    });

    jest.advanceTimersByTime(100);
    expect(await promise).toBe('fallback');

    pending.resolve('too late');
    expect(await promise).toBe('fallback');
});

test('ignores a late rejection of the abandoned operation', async () => {
    const pending = createPromise<string>();

    const promise = withTimeout({
        operation: pending.promise,
        timeoutMs: 100,
        onTimeout: () => 'fallback',
    });

    jest.advanceTimersByTime(100);
    expect(await promise).toBe('fallback');

    pending.reject(new Error('too late'));
    expect(await promise).toBe('fallback');
});

test('clears the deadline once the operation wins', async () => {
    let timedOut = false;

    const result = await withTimeout({
        operation: Promise.resolve('value'),
        timeoutMs: 100,
        onTimeout: () => {
            timedOut = true;
            return 'fallback';
        },
    });

    expect(result).toBe('value');

    jest.advanceTimersByTime(1000);
    expect(timedOut).toBe(false);
});

test('forwards an abort of the caller signal to the operation signal', async () => {
    const controller = new AbortController();
    const reason = new Error('caller gave up');
    let operationSignal: AbortSignal | undefined;

    const promise = withTimeout({
        operation: signal => {
            operationSignal = signal;
            return createPromise().promise;
        },
        timeoutMs: 100,
        signal: controller.signal,
        onTimeout: () => {},
    });

    controller.abort(reason);

    expect(operationSignal?.aborted).toBe(true);
    expect(operationSignal?.reason).toBe(reason);

    // Forwarding only — an operation that ignores the abort is still bound by the deadline.
    jest.advanceTimersByTime(100);
    await promise;
});

test('forwards an already aborted caller signal before the operation starts', async () => {
    const controller = new AbortController();
    const reason = new Error('aborted upfront');
    controller.abort(reason);

    let abortedOnEntry = false;

    const promise = withTimeout({
        operation: signal => {
            abortedOnEntry = signal.aborted;
            return Promise.reject(signal.reason as Error);
        },
        timeoutMs: 100,
        signal: controller.signal,
    });

    expect(abortedOnEntry).toBe(true);
    expect(await promise.catch((error: unknown) => error)).toBe(reason);
});

test('rejects when the operation throws synchronously', async () => {
    const failure = new Error('sync throw');

    const error = await withTimeout({
        operation: () => {
            throw failure;
        },
        timeoutMs: 100,
    }).catch((thrownError: unknown) => thrownError);

    expect(error).toBe(failure);
});

test('removes its caller-signal listener on every settle path', async () => {
    const controller = new AbortController();
    const removeEventListener = jest.spyOn(controller.signal, 'removeEventListener');

    await withTimeout({ operation: Promise.resolve(1), timeoutMs: 100, signal: controller.signal });
    await withTimeout({
        operation: Promise.reject(new Error('nope')),
        timeoutMs: 100,
        signal: controller.signal,
    }).catch(() => undefined);

    const timedOut = withTimeout({
        operation: createPromise<number>().promise,
        timeoutMs: 100,
        signal: controller.signal,
        onTimeout: () => 0,
    });
    jest.advanceTimersByTime(100);
    await timedOut;

    expect(removeEventListener).toHaveBeenCalledTimes(3);
});
