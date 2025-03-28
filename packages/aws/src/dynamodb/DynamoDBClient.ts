import { DynamoDBClient as AwsDynamoDBClient } from '@aws-sdk/client-dynamodb';

import { defineService } from '@nzyme/ioc';

/**
 * Injectable version of AWS DynamoDBClient.
 * Allows to easily mock the client in tests.
 */
export const DynamoDBClient = defineService<AwsDynamoDBClient>({
    setup() {
        return new AwsDynamoDBClient();
    },
});

/**
 * Type of the DynamoDB client.
 */
export type DynamoDBClient = AwsDynamoDBClient;
