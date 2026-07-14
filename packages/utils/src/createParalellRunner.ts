import { createPromise } from './createPromise.js';

/**
 * Options for creating a parallel runner.
 */
type ParalelllRunnerOptions = {
    /** Maximum number of concurrent threads to run */
    concurrency: number;
    /** Function to execute in each thread */
    handler: () => Promise<false | void>;
};

/**
 * Creates a parallel runner that executes a handler function in multiple concurrent threads.
 * The runner can be started, stopped, and waited for completion.
 * @util
 *
 * @param options - Configuration for the parallel runner
 * @returns An object with `start`, `stop`, and `wait` methods
 *
 * @example
 * ```typescript
 * const runner = createParalellRunner({
 *     concurrency: 3,
 *     handler: async () => {
 *         await processItem();
 *         // Return false to stop this thread
 *         return false;
 *     }
 * });
 *
 * // Start processing
 * await runner.start();
 *
 * // Stop all threads
 * await runner.stop();
 *
 * // Wait for all threads to complete
 * await runner.wait();
 * ```
 */
export function createParalellRunner(options: ParalelllRunnerOptions) {
    const { handler, concurrency } = options;

    let promise: ReturnType<typeof createPromise<void>> | undefined;
    let active = 0;
    let done = true;

    return {
        start,
        stop,
        wait,
    };

    async function start() {
        if (!promise) {
            promise = createPromise();
        }

        done = false;

        for (let i = active; i < concurrency; i++) {
            void startThread();
        }

        await promise.promise;
    }

    async function stop() {
        done = true;
        await promise?.promise;
    }

    async function wait() {
        await promise?.promise;
    }

    async function startThread() {
        active++;

        while (true) {
            if (done) {
                stopThread();
                return;
            }

            try {
                const result = await handler();
                if (result === false) {
                    stopThread();
                    return;
                }
            } catch (e) {
                active--;
                done = true;
                promise?.reject(e);
                throw e;
            }
        }
    }

    function stopThread() {
        active--;
        if (active === 0) {
            done = true;
            promise?.resolve();
        }
    }
}
