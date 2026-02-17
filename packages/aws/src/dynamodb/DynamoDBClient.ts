import { DynamoDBClient as AwsDynamoDBClient } from '@aws-sdk/client-dynamodb';

import { defineService } from '@nzyme/ioc/Service.js';

/**
 * Type of the DynamoDB client.
 */
export type DynamoDBClient = AwsDynamoDBClient;

/**
 * Injectable version of AWS DynamoDBClient.
 * Allows to easily mock the client in tests.
 */
export const DynamoDBClient = defineService<DynamoDBClient>({
    setup() {
        return new AwsDynamoDBClient();
    },
});
