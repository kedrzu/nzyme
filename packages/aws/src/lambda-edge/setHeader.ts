import type { CloudFrontHeaders } from 'aws-lambda';

/**
 * Sets a header on the response.
 */
export function setHeader(headers: CloudFrontHeaders, key: string, value: string) {
    let header = headers[key];
    if (header == null) {
        header = [];
        headers[key] = header;
    }

    header.push({ key, value });
}
