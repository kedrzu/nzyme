import type { HttpMethod } from '@nzyme/fetch-utils/HttpMethod.js';
import type { Router } from '@nzyme/rpc/createRouter.js';

import type { types } from './types.js';

/**
 * Executes a lambda RPC API v2.
 *
 * A body API Gateway or a Lambda function URL delivered base64-encoded (`isBase64Encoded`, set for
 * a content type it does not treat as text) is decoded to UTF-8 first, so the router always sees
 * the raw request text.
 * @param router - The API router to use.
 * @param event - The event to execute.
 * @returns The result of the lambda RPC API v2.
 */
export async function executeLambdaRpcApiV2(router: Router, event: types.APIGatewayProxyEventV2) {
    const method: HttpMethod = (event.requestContext.http.method.toUpperCase() as HttpMethod | undefined) || 'GET';

    const body =
        event.body !== undefined && event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf8')
            : event.body;

    const response = await router.execute({
        method,
        path: event.pathParameters?.proxy || event.rawPath,
        query: event.queryStringParameters,
        headers: event.headers,
        body,
        ip: event.requestContext.http.sourceIp,
    });

    // Convert headers to a format that can be used in the Lambda response
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) {
            headers[key] = value.join(',');
        } else {
            headers[key] = String(value);
        }
    }

    const result: types.APIGatewayProxyResultV2 = {
        statusCode: response.status,
        body: response.body as string,
        headers: headers,
    };

    return result;
}
