import { createPromise } from './createPromise.js';
import { TimeoutError } from './TimeoutError.js';
import { waitForever } from './waitForever.js';

/**
 * Options for the withTimeout function.
 */
export interface WithTimeoutOptions<T> {
    /**
     * The work to bound. Given a function, it receives a signal that is aborted when the
     * deadline elapses, so a signal-aware operation (`fetch`, an AWS SDK call) is really
     * cancelled; a bare promise can only be abandoned.
     */
    operation: ((signal: AbortSignal) => PromiseLike<T>) | Promise<T>;

    /** Deadline in milliseconds, measured from the moment the operation starts. */
    timeoutMs: number;

    /**
     * The caller's own cancellation signal, forwarded to the operation's signal.
     * Forwarding only — the operation decides what an abort means, and the deadline still
     * bounds it if the operation ignores the abort.
     */
    signal?: AbortSignal;

    /**
     * Runs when the deadline elapses, after the operation's signal has been aborted.
     * Return a value to resolve with it, or throw to reject with a caller-chosen error.
     * Omitted, the deadline rejects with {@link TimeoutError}.
     *
     * `T` is never inferred from here, so a logging-only handler cannot silently widen the
     * success type to `T | void`.
     */
    onTimeout?: () => NoInfer<T> | PromiseLike<NoInfer<T>>;
}

/**
 * Node and Bun return a Timeout object carrying `unref`; browsers return a plain number.
 */
interface UnrefableTimer {
    unref(): void;
}

/**
 * Runs an operation under a deadline, aborting it when the deadline elapses. Once the deadline
 * has fired the outcome is `onTimeout`'s: a late settlement of the abandoned operation is
 * discarded, and its rejection stays handled.
 * @util
 *
 * @param options - The operation, its deadline, and what to do when the deadline elapses.
 * @returns The operation's result, or `onTimeout`'s.
 *
 * @example
 * ```typescript
 * // Reject with TimeoutError, cancelling the request
 * const res = await withTimeout({
 *     operation: signal => fetch(url, { signal }),
 *     timeoutMs: 3000,
 * });
 *
 * // Log and carry on — the operation cannot be cancelled, so it is merely abandoned
 * await withTimeout({
 *     operation: () => cognito.signOut(),
 *     timeoutMs: 3000,
 *     onTimeout: () => logger.warn('Sign-out did not respond in time'),
 * });
 *
 * // Reject with a domain error
 * await withTimeout({
 *     operation: signal => query(signal),
 *     timeoutMs: QUERY_TIMEOUT_MS,
 *     onTimeout: () => {
 *         throw new ApplicationError('Query exceeded the wall-time limit', { timeoutMs: QUERY_TIMEOUT_MS });
 *     },
 * });
 * ```
 */
export function withTimeout<T>(options: WithTimeoutOptions<T>): Promise<T> {
    const { operation, timeoutMs, signal, onTimeout } = options;

    // Hand-rolled from AbortController + setTimeout rather than AbortSignal.timeout() /
    // AbortSignal.any(): both are unavailable on browsers the apps still support (iOS Safari <16 /
    // Chrome <103, and Safari <17.4 for `any`), where they would throw synchronously.
    const controller = new AbortController();
    const expired = createPromise();
    let timedOut = false;

    const timer = setTimeout(onDeadline, timeoutMs);
    unrefTimer(timer);

    signal?.addEventListener('abort', onCallerAbort);
    if (signal?.aborted) {
        controller.abort(signal.reason);
    }

    // The race is only a join: `timedOut` decides the winner, so an operation that rejects from
    // inside `abort()` can never overtake the deadline's outcome.
    return Promise.race([runOperation(), awaitDeadline()]);

    async function runOperation(): Promise<T> {
        try {
            // Invoked in here so a synchronous throw surfaces as a rejection.
            const value = await (typeof operation === 'function' ? operation(controller.signal) : operation);
            if (timedOut) {
                return await waitForever();
            }

            cleanup();
            return value;
        } catch (error) {
            if (timedOut) {
                return await waitForever();
            }

            cleanup();
            throw error;
        }
    }

    async function awaitDeadline(): Promise<T> {
        await expired.promise;

        if (!onTimeout) {
            throw new TimeoutError(timeoutMs);
        }

        return onTimeout();
    }

    function onDeadline() {
        // Flag first: aborting can reject the operation synchronously, and that rejection must
        // find the deadline already declared the winner.
        timedOut = true;
        cleanup();
        controller.abort(new TimeoutError(timeoutMs));
        expired.resolve();
    }

    function onCallerAbort() {
        controller.abort(signal?.reason);
    }

    function cleanup() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
    }
}

function unrefTimer(timer: unknown) {
    if (isUnrefable(timer)) {
        timer.unref();
    }
}

function isUnrefable(timer: unknown): timer is UnrefableTimer {
    return typeof timer === 'object' && timer !== null && 'unref' in timer;
}
