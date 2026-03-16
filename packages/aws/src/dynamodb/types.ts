import type { AttributeValue, KeysAndAttributes } from '@aws-sdk/client-dynamodb';

/** A DynamoDB item represented as a map of attribute names to values. */
export type DynamoItem = Record<string, AttributeValue>;
/** A DynamoDB key specification mapping table names to keys and attributes. */
export type DynamoKey = Record<string, KeysAndAttributes>;
