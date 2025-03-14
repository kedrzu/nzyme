import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

import type { DynamoItem } from './types.js';

/**
 * Executes a query or scan operation on a DynamoDB table and returns all items.
 * @param client - The DynamoDB client to use for the operation.
 * @param command - The query or scan command to execute.
 * @returns A promise that resolves to an array of DynamoItem objects.
 */
export async function executeQueryAll(client: DynamoDBClient, command: QueryCommand | ScanCommand) {
    const items: DynamoItem[] = [];

    while (command) {
        const result = await client.send(command);
        if (result.Items) {
            items.push(...result.Items);
        }

        if (result.LastEvaluatedKey) {
            if (command instanceof ScanCommand) {
                command = new ScanCommand({
                    ...command.input,
                    ExclusiveStartKey: result.LastEvaluatedKey,
                });
            } else {
                command = new QueryCommand({
                    ...command.input,
                    ExclusiveStartKey: result.LastEvaluatedKey,
                });
            }
        } else {
            break;
        }
    }

    return items;
}
