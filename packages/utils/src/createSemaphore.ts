import { createPromise } from './createPromise.js';

/**
 * Counting semaphore that caps how many operations run concurrently.
 */
export interface Semaphore {
    /**
     * Runs an operation once a permit is available, releasing the permit
     * afterwards on both the success and failure paths.
     */
    run<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Creates a counting semaphore that allows at most `limit` operations to run
 * concurrently. Excess callers wait until a permit is released.
 *
 * Permits are handed directly from a finishing operation to the next waiter
 * (FIFO), so a released permit is never momentarily "available" while callers
 * are queued — this avoids a thundering-herd re-check of the counter.
 * @util
 *
 * @param limit - Maximum number of operations allowed to run concurrently.
 *   Must be a positive integer; non-finite or non-positive values throw.
 *
 * @example
 * ```typescript
 * const semaphore = createSemaphore(4);
 * await Promise.all(urls.map(url => semaphore.run(() => fetch(url))));
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createSemaphore(limit: number): Semaphore {
    if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`createSemaphore: limit must be a positive number, got ${limit}`);
    }

    let available = limit;
    const waiters: Array<() => void> = [];

    return { run };

    async function run<T>(operation: () => Promise<T>): Promise<T> {
        await acquire();
        try {
            return await operation();
        } finally {
            release();
        }
    }

    async function acquire(): Promise<void> {
        if (available > 0) {
            available--;
            return;
        }

        const { promise, resolve } = createPromise();
        waiters.push(resolve);
        await promise;
    }

    function release(): void {
        const next = waiters.shift();
        if (next) {
            // Permit is handed directly to the next waiter, so `available`
            // stays unchanged.
            next();
        } else {
            available++;
        }
    }
}
