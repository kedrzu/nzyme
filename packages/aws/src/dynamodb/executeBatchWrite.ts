import {
    BatchWriteItemCommand,
    type DynamoDBClient,
    type WriteRequest,
} from '@aws-sdk/client-dynamodb';

type BatchWriteRequest = {
    client: DynamoDBClient;
    tableName: string;
    items: WriteRequest[];
};

const MAX_BATCH_SIZE = 25;

/**
 * Executes a batch write operation on a DynamoDB table.
 * @param request - The request object containing the DynamoDB client, table name, and items to write.
 */
export async function executeBatchWrite(request: BatchWriteRequest) {
    let batch: WriteRequest[] = [];
    const { items, client, tableName } = request;

    for (let i = 0; i < items.length; i++) {
        batch.push(items[i]!);

        if (batch.length === MAX_BATCH_SIZE || i === items.length - 1) {
            batch = await executeSingleBatch({
                client,
                tableName,
                items: batch,
            });

            if (batch.length >= MAX_BATCH_SIZE) {
                throw new Error('Too many unprocessed items after single batch execution');
            }
        }
    }
}

async function executeSingleBatch(request: BatchWriteRequest) {
    const tableName = request.tableName;
    const command = new BatchWriteItemCommand({
        RequestItems: {
            [tableName]: request.items,
        },
    });

    const result = await request.client.send(command);

    return result.UnprocessedItems?.[tableName] ?? [];
}
