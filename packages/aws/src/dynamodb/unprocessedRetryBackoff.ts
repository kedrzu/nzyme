import type { ExponentialBackoffOptions } from '@nzyme/utils/createExponentialBackoff.js';

/**
 * Backoff between retries of the keys or items a DynamoDB batch call returns as unprocessed — about
 * 1.5 s of waiting in total before the batch helpers give up and throw.
 */
export const UNPROCESSED_RETRY_BACKOFF: ExponentialBackoffOptions = {
    maxRetries: 5,
    baseDelay: 50,
};
