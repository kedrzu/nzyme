/**
 * Read permissions that can be performed on a DynamoDB table.
 */
export const DYNAMODB_READ_PERMISSIONS: readonly string[] = [
    'dynamodb:GetItem',
    'dynamodb:BatchGetItem',
    'dynamodb:Scan',
    'dynamodb:Query',
    'dynamodb:ConditionCheckItem',
];

/**
 * Write permissions that can be performed on a DynamoDB table.
 */
export const DYNAMODB_WRITE_PERMISSIONS: readonly string[] = [
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem',
    'dynamodb:BatchWriteItem',
];
