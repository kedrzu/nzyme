import { BatchGetItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { BatchGetItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { describe, expect, spyOn, test } from 'bun:test';

import { executeBatchGet } from './executeBatchGet.js';
import type { DynamoItem } from './types.js';

const TABLE = 'table';

describe('executeBatchGet', () => {
    // Must protect: keys DynamoDB leaves unprocessed in the final batch are fetched, not dropped.
    test('retries the unprocessed keys of the last batch until all are read', async () => {
        const keys = Array.from({ length: 103 }, (_, i): DynamoItem => ({ _pk: { S: `pk#${i}` } }));
        const client = createClient(sent => (sent.length > 1 ? sent.slice(-1) : []));

        const items = await executeBatchGet({ client, tableName: TABLE, keys });

        expect(items.map(item => item._pk?.S).toSorted()).toEqual(keys.map(key => key._pk?.S).toSorted());
    });

    // Must protect: keys that never get processed fail loudly instead of reading as missing items.
    test('throws when keys stay unprocessed after the last retry', async () => {
        const client = createClient(sent => sent);

        const result = executeBatchGet({ client, tableName: TABLE, keys: [{ _pk: { S: 'pk#0' } }] });

        await expect(result).rejects.toThrow('DynamoDB left 1 keys unprocessed after 5 retries');
    });
});

/** A client whose `BatchGetItem` leaves `unprocessed(sent)` unread and returns the rest as items. */
function createClient(unprocessed: (sent: DynamoItem[]) => DynamoItem[]) {
    const client = new DynamoDBClient({ region: 'us-east-1' });

    spyOn(client, 'send').mockImplementation((command: unknown) => {
        if (!(command instanceof BatchGetItemCommand)) {
            return Promise.reject(new Error('Unexpected command'));
        }

        const sent = command.input.RequestItems?.[TABLE]?.Keys ?? [];
        expect(sent.length).toBeLessThanOrEqual(100);

        const left = unprocessed(sent);
        const output: Partial<BatchGetItemCommandOutput> = {
            Responses: { [TABLE]: sent.filter(key => !left.includes(key)) },
            UnprocessedKeys: left.length > 0 ? { [TABLE]: { Keys: left } } : {},
        };
        return Promise.resolve(output);
    });

    return client;
}
