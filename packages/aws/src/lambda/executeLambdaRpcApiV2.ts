import type { HttpMethod } from '@nzyme/fetch-utils/HttpMethod.js';
import type { Router } from '@nzyme/rpc/createRouter.js';

import type { types } from './types.js';

/**
 * Executes a lambda RPC API v2.
 * @param router - The API router to use.
 * @param event - The event to execute.
 * @returns The result of the lambda RPC API v2.
 */
export async function executeLambdaRpcApiV2(
    router: Router,
    event: types.APIGatewayProxyEventV2,
): Promise<types.APIGatewayProxyStructuredResultV2> {
    const method: HttpMethod = (event.requestContext.http.method.toUpperCase() as HttpMethod | undefined) || 'GET';

    const response = await router.execute({
        method,
        path: event.pathParameters?.proxy || event.rawPath,
        query: event.queryStringParameters,
        headers: getRequestHeaders(event),
        body: event.body,
        ip: event.requestContext.http.sourceIp,
    });

    // Convert headers to a format that can be used in the Lambda response. Payload format 2.0 has no
    // multi-value headers: `Set-Cookie` goes to the dedicated `cookies` field, one entry per cookie,
    // because a comma-joined `Set-Cookie` is not a valid header (cookie dates contain commas).
    const headers: Record<string, string> = {};
    const cookies: string[] = [];
    for (const [key, value] of Object.entries(response.headers)) {
        if (key.toLowerCase() === 'set-cookie') {
            if (Array.isArray(value)) {
                cookies.push(...value);
            } else if (value !== undefined) {
                cookies.push(String(value));
            }
        } else if (Array.isArray(value)) {
            headers[key] = value.join(',');
        } else {
            headers[key] = String(value);
        }
    }

    const body = await encodeBody(response.body, headers['content-type']);
    const result: types.APIGatewayProxyStructuredResultV2 = {
        statusCode: response.status,
        body: body.text,
        headers: headers,
    };

    if (body.isBase64Encoded) {
        result.isBase64Encoded = true;
    }

    if (cookies.length > 0) {
        result.cookies = cookies;
    }

    return result;
}

/**
 * The request headers as the router expects them. Payload format 2.0 moves the request's cookies out of
 * `headers` into the `cookies` field, one entry per cookie, so they are folded back into a single
 * `cookie` header — merged with one already there rather than replacing it.
 */
function getRequestHeaders(event: types.APIGatewayProxyEventV2): types.APIGatewayProxyEventV2['headers'] {
    if (!event.cookies?.length) {
        return event.headers;
    }

    const cookies = [event.headers['cookie'], ...event.cookies].filter(Boolean);
    return { ...event.headers, cookie: cookies.join('; ') };
}

/**
 * Encodes a router response body for the Lambda result, which only carries strings: textual
 * content is sent as-is, anything else is base64-encoded and flagged so API Gateway decodes it.
 */
async function encodeBody(
    body: string | Blob | undefined,
    contentType: string | undefined,
): Promise<{ text: string | undefined; isBase64Encoded: boolean }> {
    if (!(body instanceof Blob)) {
        return { text: body, isBase64Encoded: false };
    }

    if (isTextualContentType(contentType ?? body.type)) {
        return { text: await body.text(), isBase64Encoded: false };
    }

    return { text: Buffer.from(await body.arrayBuffer()).toString('base64'), isBase64Encoded: true };
}

function isTextualContentType(contentType: string) {
    const mimeType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

    return (
        mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType.endsWith('+json') ||
        mimeType.endsWith('+xml') ||
        mimeType === 'application/javascript'
    );
}
