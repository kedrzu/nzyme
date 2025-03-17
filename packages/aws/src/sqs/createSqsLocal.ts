import { arrayRemove, findAndRemove } from '@nzyme/utils';

import type { Queue, QueueMessage } from './types.js';

/**
 * Options for the local SQS client.
 */
export interface QueueLocalOptions<T> {
    /**
     * The concurrency of the local SQS.
     */
    concurrency: number;
    /**
     * The handler for the local SQS.
     */
    handler: (message: QueueMessage<T>) => Promise<void>;
    /**
     * The on success handler for the local SQS.
     */
    onSuccess?: (message: QueueMessage<T>) => Promise<void>;
    /**
     * The on error handler for the local SQS.
     */
    onError?: (message: QueueMessage<T>, error: Error) => Promise<void>;
}

/**
 * A local queue that can be used to send messages to an SQS queue.
 */
export interface QueueLocal<T> extends Queue<T> {
    /**
     * Wait for all messages to be processed.
     */
    wait: () => Promise<void>;
}

/**
 * Creates a new SQS client that handles messages locally.
 */
export function createSqsLocal<T>(options: QueueLocalOptions<T>): QueueLocal<T> {
    const { concurrency, handler, onSuccess, onError } = options;
    const queue: QueueMessage<T>[] = [];
    const currentPromises: Promise<void>[] = [];
    // Aktualnie przetwarzane kolejki eventów.
    // Dzięki temu możemy zapewnić kolejność FIFO w ramach jednej kolejki.
    const currentQueues = new Set<string>();

    return {
        send,
        wait,
    };

    function send(messages: QueueMessage<T> | QueueMessage<T>[]) {
        if (Array.isArray(messages)) {
            queue.push(...messages);
        } else {
            queue.push(messages);
        }

        void dispatch();
        return Promise.resolve();
    }

    async function wait() {
        while (currentPromises.length > 0) {
            await Promise.all(currentPromises);
        }
    }

    function dispatch() {
        while (currentPromises.length < concurrency) {
            const message = findAndRemove(queue, m => {
                return m.messageGroupId == null || !currentQueues.has(m.messageGroupId);
            });

            if (!message) {
                break;
            }

            if (message.messageGroupId != null) {
                currentQueues.add(message.messageGroupId);
            }

            const promise = handle(message).finally(() => {
                arrayRemove(currentPromises, promise);
                if (message.messageGroupId != null) {
                    currentQueues.delete(message.messageGroupId);
                }
                dispatch();
            });

            currentPromises.push(promise);
        }
    }

    async function handle(message: QueueMessage<T>) {
        try {
            await handler(message);
            await onSuccess?.(message);
        } catch (e) {
            await onError?.(message, e as Error);
        }
    }
}
