import { waitFor } from './waitFor.js';
import { withTimeout } from './withTimeout.js';

/**
 * Options for the waitUntil function.
 */
export interface WaitUntilOptions {
    /** How often to re-check the condition, in milliseconds. */
    intervalMs?: number;

    /**
     * Deadline in milliseconds, measured from the first check. Omitted, the condition is
     * polled indefinitely — only do that when something else guarantees it eventually holds.
     */
    timeoutMs?: number;

    /**
     * Runs when the deadline elapses. Return to give up quietly, or throw to reject with a
     * caller-chosen error. Omitted, the deadline rejects with `TimeoutError`.
     *
     * Only meaningful together with `timeoutMs`.
     */
    onTimeout?: () => void | PromiseLike<void>;
}

/**
 * Waits until the condition holds, re-checking it on an interval.
 *
 * The condition may be async — it is awaited, so a promise is judged by what it resolves to
 * rather than by being truthy. It is checked once before the first wait, so a condition that
 * already holds costs nothing.
 * @util
 *
 * @param condition - The condition to wait for. Awaited on every check.
 * @param options - Polling interval and deadline. See {@link WaitUntilOptions}.
 * @returns A promise that resolves once the condition holds.
 *
 * @example
 * ```typescript
 * // Poll indefinitely, every 100ms
 * await waitUntil(() => queue.isEmpty());
 *
 * // Bounded, with a diagnostic error
 * await waitUntil(() => tunnel.mappings.length > 0, {
 *     intervalMs: 10,
 *     timeoutMs: 1000,
 *     onTimeout: () => {
 *         throw new Error('Timed out waiting for the tunnel to set its mappings.');
 *     },
 * });
 *
 * // Async condition, giving up quietly
 * await waitUntil(async () => (await findListeners(port)).length === 0, {
 *     timeoutMs: 5000,
 *     onTimeout: () => {},
 * });
 * ```
 */
export function waitUntil(condition: () => unknown, options: WaitUntilOptions = {}): Promise<void> {
    const { intervalMs = 100, timeoutMs, onTimeout } = options;

    if (timeoutMs === undefined) {
        return poll();
    }

    // The deadline, its abort plumbing and the discarding of a late settlement all live in
    // withTimeout — polling only has to stop when it is told to.
    return withTimeout({ operation: poll, timeoutMs, onTimeout });

    async function poll(signal?: AbortSignal) {
        for (;;) {
            if (await condition()) {
                return;
            }

            // Without a deadline there is no signal, and the loop runs until the condition holds.
            // With one, this is what stops the polling instead of leaving it running forever.
            if (signal?.aborted) {
                return;
            }

            await waitFor(intervalMs);
        }
    }
}
