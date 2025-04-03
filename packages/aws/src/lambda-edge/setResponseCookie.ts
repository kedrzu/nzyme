import type { CloudFrontResponse } from 'aws-lambda';

/**
 * Sets a cookie on the response.
 */
export function setResponseCookie(response: CloudFrontResponse, cookie: string) {
    const headers = response.headers;
    const cookies = headers['set-cookie'] || (headers['set-cookie'] = []);

    cookies.push({
        key: 'set-cookie',
        value: cookie,
    });
}
