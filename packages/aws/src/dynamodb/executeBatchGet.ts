import { BatchGetItemCommand } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { createExponentialBackoff } from '@nzyme/utils/createExponentialBackoff.js';

import type { DynamoItem } from './types.js';
import { UNPROCESSED_RETRY_BACKOFF } from './unprocessedRetryBackoff.js';

type BatchGetRequest = {
    client: DynamoDBClient;
    tableName: string;
    keys: DynamoItem[];
};

const MAX_BATCH_SIZE = 100;

/**
 * Executes a batch get operation on a DynamoDB table, in batches of 100. Keys DynamoDB returns as
 * unprocessed are retried with exponential backoff; when some are still unprocessed after the last
 * retry it throws, so a missing item always means the item does not exist.
 * @param request - The request object containing the DynamoDB client, table name, and keys to get.
 * @returns A promise that resolves to an array of DynamoItem objects.
 */
export async function executeBatchGet(request: BatchGetRequest) {
    const { keys, client, tableName } = request;
    const items: DynamoItem[] = [];

    for (let i = 0; i < keys.length; i += MAX_BATCH_SIZE) {
        const backoff = createExponentialBackoff(UNPROCESSED_RETRY_BACKOFF);
        let pending = keys.slice(i, i + MAX_BATCH_SIZE);

        while (true) {
            const result = await client.send(
                new BatchGetItemCommand({
                    RequestItems: {
                        [tableName]: { Keys: pending },
                    },
                }),
            );

            items.push(...(result.Responses?.[tableName] ?? []));
            pending = result.UnprocessedKeys?.[tableName]?.Keys ?? [];

            if (pending.length === 0) {
                break;
            }

            if (!backoff.canRetry()) {
                throw new Error(`DynamoDB left ${pending.length} keys unprocessed after ${backoff.retries} retries`);
            }

            await backoff.backoff();
        }
    }

    return items;
}
