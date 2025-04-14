/**
 * Creates an async queue that processes tasks sequentially.
 * Tasks are executed one at a time in the order they were enqueued.
 *
 * @returns An object with an `enqueue` method to add tasks to the queue
 *
 * @example
 * ```typescript
 * const queue = createAsyncQueue();
 *
 * // Enqueue multiple tasks
 * await queue.enqueue(async () => {
 *     await waitFor(1000);
 *     console.log('Task 1');
 * });
 *
 * await queue.enqueue(async () => {
 *     await waitFor(1000);
 *     console.log('Task 2');
 * });
 *
 * // Tasks will execute sequentially:
 * // After 1s: "Task 1"
 * // After 2s: "Task 2"
 * ```
 */
export function createAsyncQueue() {
    type QueueItem = {
        fn: () => Promise<unknown>;
        reject: (error: Error) => void;
        resolve: () => void;
    };

    const queue: QueueItem[] = [];

    return {
        enqueue,
    };

    function enqueue(fn: () => Promise<unknown>) {
        return new Promise<void>((resolve, reject) => {
            queue.push({ fn, reject, resolve });
            if (queue.length === 1) {
                processNext();
            }
        });
    }

    function processNext() {
        const item = queue.shift();
        if (!item) {
            return;
        }

        item.fn().then(item.resolve).catch(item.reject).finally(processNext);
    }
}
