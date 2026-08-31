import { arrayRemove } from '@nzyme/utils/array/arrayRemove.js';
import { findAndRemove } from '@nzyme/utils/array/findAndRemove.js';

import type { Queue, QueueMessage } from './types.js';

/**
 * Options for the local SQS client.
 */
export interface QueueLocalOptions {
    /**
     * The concurrency of the local SQS.
     */
    concurrency: number;
    /**
     * The handler for the local SQS.
     */
    handler: (message: QueueMessage) => Promise<void> | void;
    /**
     * The on success handler for the local SQS.
     */
    onSuccess?: (message: QueueMessage) => Promise<void> | void;
    /**
     * The on error handler for the local SQS.
     */
    onError?: (message: QueueMessage, error: Error) => Promise<void> | void;
}

/**
 * A local queue that can be used to send messages to an SQS queue.
 */
export interface QueueLocal extends Queue {
    /**
     * Wait for all messages to be processed.
     */
    wait: () => Promise<void>;
}

/**
 * Creates a new SQS client that handles messages locally.
 */
export function createSqsLocal(options: QueueLocalOptions): QueueLocal {
    const { concurrency, handler, onSuccess, onError } = options;
    const queue: QueueMessage[] = [];
    const currentPromises: Promise<void>[] = [];
    // Aktualnie przetwarzane kolejki eventów.
    // Dzięki temu możemy zapewnić kolejność FIFO w ramach jednej kolejki.
    const currentQueues = new Set<string>();

    return {
        send,
        wait,
    };

    function send(messages: QueueMessage | QueueMessage[]) {
        if (Array.isArray(messages)) {
            queue.push(...messages);
        } else {
            queue.push(messages);
        }

        dispatch();
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

    async function handle(message: QueueMessage) {
        try {
            await handler(message);
            await onSuccess?.(message);
        } catch (e) {
            await onError?.(message, e as Error);
        }
    }
}
