/**
 * Configuration options for creating an async queue.
 *
 * @template T - The type of items to be processed
 */
export interface AsyncQueueOptions<T> {
    /**
     * Maximum number of items to process concurrently (default: 1).
     */
    concurrency?: number;
    /**
     * Async function that processes each item.
     */
    handler: (item: T) => Promise<unknown>;
}

/**
 * Async queue interface for processing items with concurrency control.
 *
 * @template T - The type of items to be processed
 */
export interface AsyncQueue<T> {
    /**
     * Enqueues an item to be processed by the queue.
     */
    enqueue: (item: T) => Promise<void>;
    /**
     * Waits for all currently enqueued and running items to be processed.
     */
    waitForAll: () => Promise<void>;
}

/**
 * Creates an async queue that processes items with configurable concurrency.
 * Items are processed with the specified concurrency limit in the order they were enqueued.
 * @util
 *
 * @template T - The type of items to be processed
 * @param options - Configuration options for the queue
 * @param options.handler - Async function that processes each item
 * @param options.concurrency - Maximum number of items to process concurrently (default: 1)
 * @returns An object with `enqueue` method to add items and `waitForAll` method to wait for completion
 *
 * @example
 * ```typescript
 * // Sequential processing (default)
 * const queue = createAsyncQueue({
 *     handler: async (url: string) => {
 *         const response = await fetch(url);
 *         return response.json();
 *     }
 * });
 *
 * // Concurrent processing
 * const concurrentQueue = createAsyncQueue({
 *     concurrency: 3,
 *     handler: async (data: { id: number; name: string }) => {
 *         await saveToDatabase(data);
 *         console.log(`Processed: ${data.name}`);
 *     }
 * });
 *
 * // Enqueue multiple items
 * await concurrentQueue.enqueue({ id: 1, name: 'Item 1' });
 * await concurrentQueue.enqueue({ id: 2, name: 'Item 2' });
 *
 * // Wait for all items to be processed
 * await concurrentQueue.waitForAll();
 * console.log('All items processed');
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createAsyncQueue<T>(options: AsyncQueueOptions<T>): AsyncQueue<T> {
    const { handler, concurrency = 1 } = options;

    type QueueItem = {
        item: T;
        reject: (error: unknown) => void;
        resolve: () => void;
    };

    const queue: QueueItem[] = [];
    let runningCount = 0;
    const allProcessedResolvers: (() => void)[] = [];

    return {
        enqueue,
        waitForAll,
    };

    /**
     * Enqueues an item to be processed by the queue.
     *
     * @param item - The item to process
     * @returns A promise that resolves when the item has been processed
     */
    function enqueue(item: T): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            queue.push({ item, reject, resolve });
            processNext();
        });
    }

    /**
     * Waits for all currently enqueued and running items to be processed.
     *
     * @returns A promise that resolves when the queue is empty and no items are being processed
     */
    function waitForAll(): Promise<void> {
        return new Promise<void>(resolve => {
            if (queue.length === 0 && runningCount === 0) {
                resolve();
                return;
            }
            allProcessedResolvers.push(resolve);
        });
    }

    function processNext(): void {
        while (runningCount < concurrency && queue.length > 0) {
            const queueItem = queue.shift();
            if (!queueItem) {
                break;
            }

            void processItem(queueItem);
        }
    }

    async function processItem(queueItem: QueueItem): Promise<void> {
        try {
            runningCount++;
            await handler(queueItem.item);
            queueItem.resolve();
        } catch (error) {
            queueItem.reject(error);
        } finally {
            runningCount--;
            processNext();
            checkIfAllProcessed();
        }
    }

    function checkIfAllProcessed(): void {
        if (queue.length === 0 && runningCount === 0) {
            const resolvers = allProcessedResolvers.splice(0);
            for (const resolver of resolvers) {
                resolver();
            }
        }
    }
}
