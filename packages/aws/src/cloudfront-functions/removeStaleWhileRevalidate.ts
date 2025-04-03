import type { CloudFrontHeaders } from './types.js';

const staleWhileRevalidateRegex = /(,\s*)?stale-while-revalidate=[\d]+/g;

/** Do not pass stale-while-revalidate to client for better page caching */
export function removeStaleWhileRevalidate(headers: CloudFrontHeaders) {
    const cacheControl = headers['cache-control'];
    if (cacheControl?.value) {
        cacheControl.value = cacheControl.value.replace(staleWhileRevalidateRegex, '');
    }
}
