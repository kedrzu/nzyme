import type { HttpMethod } from '@nzyme/fetch-utils';
import type { Router } from '@nzyme/rpc';

import type { types } from './types.js';

/**
 * Executes a lambda RPC API v2.
 * @param router - The API router to use.
 * @param event - The event to execute.
 * @returns The result of the lambda RPC API v2.
 */
export async function executeLambdaRpcApiV2(router: Router, event: types.APIGatewayProxyEventV2) {
    const method: HttpMethod = (event.requestContext.http.method.toUpperCase() as HttpMethod | undefined) || 'GET';

    const response = await router.execute({
        method,
        path: event.pathParameters?.proxy || event.rawPath,
        query: event.queryStringParameters,
        headers: event.headers,
        body: event.body,
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
