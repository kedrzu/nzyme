import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';

import type { HttpMethod } from '@nzyme/api-core';
import type { ApiRouter } from '@nzyme/api-server';

/**
 * Defines a lambda handler for a given event and result type.
 * @param api - The API router to use.
 * @returns A lambda handler.
 * @__NO_SIDE_EFFECTS__
 */
export function createLambdaApiHandler(api: ApiRouter): APIGatewayProxyHandlerV2 {
    return async event => {
        const method: HttpMethod =
            (event.requestContext?.http?.method.toUpperCase() as HttpMethod | undefined) || 'GET';

        const response = await api.execute({
            method,
            path: event.pathParameters?.proxy || event.rawPath,
            query: event.queryStringParameters,
            headers: event.headers,
            body: event.body,
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

        const result: APIGatewayProxyResultV2 = {
            statusCode: response.status,
            body: response.body as string,
            headers: headers,
        };

        return result;
    };
}
