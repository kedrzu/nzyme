import type { HttpMethod } from '@nzyme/fetch-utils';
import type { Router } from '@nzyme/rpc';

import type { types } from './types.js';

/**
 *
 */
export interface LambdaRpcHandler {
    (event: types.APIGatewayProxyEventV2): Promise<types.APIGatewayProxyStructuredResultV2>;
}

/**
 * Defines a lambda handler for a given event and result type.
 * @param router - The API router to use.
 * @returns A lambda handler.
 * @__NO_SIDE_EFFECTS__
 */
export function createLambdaRpcHandler(router: Router): LambdaRpcHandler {
    return async event => {
        const method: HttpMethod = (event.requestContext.http.method.toUpperCase() as HttpMethod | undefined) || 'GET';

        const response = await router({
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
    };
}
