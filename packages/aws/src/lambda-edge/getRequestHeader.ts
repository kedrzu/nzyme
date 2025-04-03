import type { CloudFrontRequest } from 'aws-lambda';

/**
 * Retrieves a header from the request.
 */
export function getRequestHeader(request: CloudFrontRequest, name: string) {
    const header = request.headers[name];
    return header && header[0] && header[0].value;
}
