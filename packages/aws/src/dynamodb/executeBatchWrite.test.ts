import { BatchWriteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { BatchWriteItemCommandOutput, WriteRequest } from '@aws-sdk/client-dynamodb';
import { describe, expect, spyOn, test } from 'bun:test';

import { executeBatchWrite } from './executeBatchWrite.js';

const TABLE = 'table';

describe('executeBatchWrite', () => {
    // Must protect: items DynamoDB leaves unprocessed in the final batch are written, not dropped.
    test('retries the unprocessed items of the last batch until all are written', async () => {
        const items = deleteRequests(30);
        const { client, written } = createClient(sent => (sent.length > 1 ? sent.slice(-1) : []));

        await executeBatchWrite({ client, items: { [TABLE]: items } });

        expect(written.toSorted()).toEqual(items.map(keyOf).toSorted());
    });

    // Must protect: a batch that never gets processed fails loudly instead of reporting success.
    test('throws when items stay unprocessed after the last retry', async () => {
        const { client, written } = createClient(sent => sent);

        const result = executeBatchWrite({ client, items: { [TABLE]: deleteRequests(3) } });

        await expect(result).rejects.toThrow('DynamoDB left 3 items unprocessed after 5 retries');
        expect(written).toEqual([]);
    });
});

function deleteRequests(count: number): WriteRequest[] {
    return Array.from({ length: count }, (_, i) => ({ DeleteRequest: { Key: { _pk: { S: `pk#${i}` } } } }));
}

function keyOf(request: WriteRequest) {
    return request.DeleteRequest?.Key?._pk?.S;
}

/** A client whose `BatchWriteItem` leaves `unprocessed(sent)` unwritten and records the rest. */
function createClient(unprocessed: (sent: WriteRequest[]) => WriteRequest[]) {
    const client = new DynamoDBClient({ region: 'us-east-1' });
    const written: (string | undefined)[] = [];

    spyOn(client, 'send').mockImplementation((command: unknown) => {
        if (!(command instanceof BatchWriteItemCommand)) {
            return Promise.reject(new Error('Unexpected command'));
        }

        const sent = command.input.RequestItems?.[TABLE] ?? [];
        expect(sent.length).toBeLessThanOrEqual(25);

        const left = unprocessed(sent);
        written.push(...sent.filter(request => !left.includes(request)).map(keyOf));

        const output: Partial<BatchWriteItemCommandOutput> = {
            UnprocessedItems: left.length > 0 ? { [TABLE]: left } : {},
        };
        return Promise.resolve(output);
    });

    return { client, written };
}
