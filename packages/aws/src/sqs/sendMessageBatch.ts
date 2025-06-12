import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageBatchCommand, SendMessageCommand } from '@aws-sdk/client-sqs';

import { splitIntoChunks } from '@nzyme/utils';

/**
 * Options for sending a batch of messages to an SQS queue.
 */
export interface SendMessageBatchOptions {
    /**
     * SQS client.
     */
    client: SQSClient;
    /**
     * URL of the queue.
     */
    queueUrl: string;
    /**
     * Messages to send.
     */
    messages: {
        /**
         * Message body.
         */
        body: string;
        /**
         * Message deduplication ID.
         */
        deduplicationId?: string;
        /**
         * Message group ID.
         */
        groupId?: string;
    }[];
}

/**
 * Sends a batch of messages to an SQS queue.
 */
export async function sendMessageBatch(options: SendMessageBatchOptions) {
    const { client, queueUrl, messages } = options;

    if (messages.length === 0) {
        return;
    }

    // Publish a single event
    if (messages.length === 1) {
        const message = messages[0]!;
        const command = new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageGroupId: message.groupId,
            MessageBody: message.body,
            MessageDeduplicationId: message.deduplicationId,
        });

        await client.send(command);
    }

    // Publish multiple events in a batch
    else {
        const batches = splitIntoChunks(messages, 10);
        let id = 0;

        await Promise.all(
            batches.map(async batch => {
                const command = new SendMessageBatchCommand({
                    QueueUrl: queueUrl,
                    Entries: batch.map(message => {
                        return {
                            Id: (id++).toString(),
                            MessageGroupId: message.groupId,
                            MessageBody: message.body,
                            MessageDeduplicationId: message.deduplicationId,
                        };
                    }),
                });

                await client.send(command);
            }),
        );
    }
}
