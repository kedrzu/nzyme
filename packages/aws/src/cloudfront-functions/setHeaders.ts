import type { CloudFrontHeaders } from './types.js';

/**
 * Sets headers on the response or request.
 */
export function setHeaders(headers: CloudFrontHeaders, headersToSet: Record<string, string>) {
    for (const header in headersToSet) {
        headers[header] = {
            value: headersToSet[header]!,
        };
    }
}
