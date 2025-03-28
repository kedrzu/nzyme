import type { SQSClient, SendMessageBatchCommandInput } from '@aws-sdk/client-sqs';
import { SendMessageBatchCommand, SendMessageCommand } from '@aws-sdk/client-sqs';

import { splitIntoChunks } from '@nzyme/utils';

/**
 * Sends a batch of messages to an SQS queue.
 */
export async function sendMessageBatch(client: SQSClient, input: SendMessageBatchCommandInput) {
    const { QueueUrl: queueUrl, Entries: entries } = input;

    if (!entries?.length) {
        return;
    }

    // Publish a single event
    if (entries.length === 1) {
        const message = entries[0]!;
        const command = new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageGroupId: message.MessageGroupId,
            MessageBody: message.MessageBody,
            MessageDeduplicationId: message.MessageDeduplicationId,
        });

        await client.send(command);
    }

    // Publish multiple events in a batch
    else {
        const batches = splitIntoChunks(entries, 10);
        let id = 0;

        await Promise.all(
            batches.map(async batch => {
                const command = new SendMessageBatchCommand({
                    QueueUrl: queueUrl,
                    Entries: batch.map(message => {
                        return {
                            Id: (id++).toString(),
                            MessageGroupId: message.MessageGroupId,
                            MessageBody: message.MessageBody,
                            MessageDeduplicationId: message.MessageDeduplicationId,
                        };
                    }),
                });

                await client.send(command);
            }),
        );
    }
}
