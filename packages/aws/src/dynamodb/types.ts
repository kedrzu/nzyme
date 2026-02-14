import type { AttributeValue, KeysAndAttributes } from '@aws-sdk/client-dynamodb';

/**
 *
 */
export type DynamoItem = Record<string, AttributeValue>;
/**
 *
 */
export type DynamoKey = Record<string, KeysAndAttributes>;
