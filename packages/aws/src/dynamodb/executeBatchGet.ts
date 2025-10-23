import { BatchGetItemCommand } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import type { DynamoItem } from './types.js';

type BatchGetRequest = {
    client: DynamoDBClient;
    tableName: string;
    keys: DynamoItem[];
};

const MAX_BATCH_SIZE = 100;

/**
 * Executes a batch get operation on a DynamoDB table.
 * @param request - The request object containing the DynamoDB client, table name, and keys to get.
 * @returns A promise that resolves to an array of DynamoItem objects.
 */
export async function executeBatchGet(request: BatchGetRequest) {
    let batch: DynamoItem[] = [];
    const items: DynamoItem[] = [];
    const { keys, client, tableName } = request;

    for (let i = 0; i < keys.length; i++) {
        batch.push(keys[i]!);

        if (batch.length === MAX_BATCH_SIZE || i === keys.length - 1) {
            const result = await executeSingleBatch({
                client,
                tableName,
                keys: batch,
            });

            items.push(...(result.Responses?.[tableName] ?? []));
            batch = (result.UnprocessedKeys?.[tableName] ?? []) as DynamoItem[];

            if (batch.length >= MAX_BATCH_SIZE) {
                throw new Error('Too many unprocessed items after single batch execution');
            }
        }
    }

    return items;
}

async function executeSingleBatch(request: BatchGetRequest) {
    const tableName = request.tableName;
    const command = new BatchGetItemCommand({
        RequestItems: {
            [tableName]: {
                Keys: request.keys,
            },
        },
    });

    return await request.client.send(command);
}
