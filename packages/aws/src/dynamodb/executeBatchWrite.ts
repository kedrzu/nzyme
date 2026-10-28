import { BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient, WriteRequest } from '@aws-sdk/client-dynamodb';

import { createExponentialBackoff } from '@nzyme/utils/createExponentialBackoff.js';

import { UNPROCESSED_RETRY_BACKOFF } from './unprocessedRetryBackoff.js';

type BatchWriteRequest = {
    client: DynamoDBClient;
    items: Record<string, WriteRequest[]>;
};

const MAX_BATCH_SIZE = 25;

/**
 * Executes a batch write operation on DynamoDB tables, in batches of 25. Items DynamoDB returns as
 * unprocessed (throttling, a hot partition) are retried with exponential backoff until every one is
 * written; when some are still unprocessed after the last retry it throws, so a write is never lost
 * silently.
 * @param request - The request object containing the DynamoDB client and the write requests per table.
 */
export async function executeBatchWrite(request: BatchWriteRequest) {
    const requests = Object.entries(request.items).flatMap(([tableName, items]) =>
        items.map(item => ({ tableName, item })),
    );

    for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
        const batch: Record<string, WriteRequest[]> = {};
        for (const { tableName, item } of requests.slice(i, i + MAX_BATCH_SIZE)) {
            (batch[tableName] ??= []).push(item);
        }

        await executeBatchUntilProcessed(request.client, batch);
    }
}

async function executeBatchUntilProcessed(client: DynamoDBClient, batch: Record<string, WriteRequest[]>) {
    const backoff = createExponentialBackoff(UNPROCESSED_RETRY_BACKOFF);
    let pending = batch;

    while (true) {
        const result = await client.send(new BatchWriteItemCommand({ RequestItems: pending }));
        pending = result.UnprocessedItems ?? {};

        const unprocessedCount = Object.values(pending).reduce((acc, items) => acc + items.length, 0);
        if (unprocessedCount === 0) {
            return;
        }

        if (!backoff.canRetry()) {
            throw new Error(`DynamoDB left ${unprocessedCount} items unprocessed after ${backoff.retries} retries`);
        }

        await backoff.backoff();
    }
}
