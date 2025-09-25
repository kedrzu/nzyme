import { getSingleValue } from './getSingleValue.js';
import type { CloudFrontHeaders } from './types.js';

/**
 * Retrieves a single value header.
 */
export function getHeader(headers: CloudFrontHeaders, key: string) {
    return getSingleValue(headers, key)?.value;
}
