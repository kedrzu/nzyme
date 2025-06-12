import { BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient, WriteRequest } from '@aws-sdk/client-dynamodb';

type BatchWriteRequest = {
    client: DynamoDBClient;
    items: Record<string, WriteRequest[]>;
};

const MAX_BATCH_SIZE = 25;

/**
 * Executes a batch write operation on a DynamoDB table.
 * @param request - The request object containing the DynamoDB client, table name, and items to write.
 */
export async function executeBatchWrite(request: BatchWriteRequest) {
    let batch: Record<string, WriteRequest[]> = {};
    let batchCount = 0;

    for (const [tableName, items] of Object.entries(request.items)) {
        for (const item of items) {
            if (!batch[tableName]) {
                batch[tableName] = [];
            }

            batch[tableName].push(item);
            batchCount++;

            if (batchCount === MAX_BATCH_SIZE) {
                batch = await executeSingleBatch({
                    client: request.client,
                    items: batch,
                });
                batchCount = countBatch(batch);
            }

            if (batchCount >= MAX_BATCH_SIZE) {
                throw new Error('Too many unprocessed items after single batch execution');
            }
        }
    }

    if (batchCount > 0) {
        await executeSingleBatch({
            client: request.client,
            items: batch,
        });
    }
}

async function executeSingleBatch(request: BatchWriteRequest) {
    const command = new BatchWriteItemCommand({
        RequestItems: request.items,
    });

    const result = await request.client.send(command);

    return result.UnprocessedItems ?? {};
}

function countBatch(batch: Record<string, WriteRequest[]>) {
    return Object.values(batch).reduce((acc, items) => acc + items.length, 0);
}
