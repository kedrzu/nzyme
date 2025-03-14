import { SQSClient, SendMessageBatchCommand, SendMessageCommand } from '@aws-sdk/client-sqs';

import { asArray, splitIntoChunks } from '@nzyme/utils';

import type { Queue, QueueMessage } from './types.js';

/**
 * Options for the SQS client.
 */
export interface SqsClientOptions {
    /**
     * The URL of the SQS queue.
     */
    queueUrl: string;
}

/**
 * Creates a new SQS client.
 */
export function createSqsClient<T>({ queueUrl }: SqsClientOptions): Queue<T> {
    const client = new SQSClient();

    return {
        send,
    };

    async function send(messages: QueueMessage<T> | readonly QueueMessage<T>[]) {
        messages = asArray(messages);

        // Publish a single event
        if (messages.length === 1) {
            const message = messages[0]!;
            const command = new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageGroupId: message.messageGroupId,
                MessageBody: JSON.stringify(message.body),
                MessageDeduplicationId: message.deduplicationId,
            });

            await client.send(command);
        }

        // Publish multiple events in a batch
        else {
            const batches = splitIntoChunks(messages, 10);

            await Promise.all(
                batches.map(async batch => {
                    const command = new SendMessageBatchCommand({
                        QueueUrl: queueUrl,
                        Entries: batch.map((message, index) => {
                            return {
                                Id: index.toString(),
                                MessageGroupId: message.messageGroupId,
                                MessageBody: JSON.stringify(message.body),
                                MessageDeduplicationId: message.deduplicationId,
                            };
                        }),
                    });

                    await client.send(command);
                }),
            );
        }
    }
}
