import { FetchError } from '@nzyme/fetch-utils/FetchError.js';
import type { HttpRequestHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import type { Json } from '@nzyme/utils/toJson.js';
import { toJsonString } from '@nzyme/utils/toJsonString.js';

import type { EndpointDefinition, EndpointDefinitionAny } from './defineEndpoint.js';
import { RpcError } from './types/RpcError.js';
import type { RpcErrorData } from './types/RpcError.js';

/**
 * Request configuration returned by the request callback.
 */
export interface RpcClientRequest {
    /**
     * The URL of the request
     */
    url: string;
    /**
     * The headers of the request
     */
    headers?: HttpRequestHeaders;
}

/**
 * Callback that returns request configuration for a given endpoint.
 */
export type RpcRequestGetter<O> = (
    endpoint: EndpointDefinitionAny,
    options?: O,
) => Promise<RpcClientRequest> | RpcClientRequest;

/**
 * Options for creating an RPC client.
 */
export interface CreateClientOptions<O = void> {
    /**
     * The function to get the request configuration.
     */
    request: RpcRequestGetter<O>;
}

/**
 * A function that calls an RPC endpoint.
 * Takes the endpoint definition, input, and optional per-call options.
 */
export type RpcCallFunction<O = void> = <TInput, TOutput>(
    endpoint: EndpointDefinition<TInput, TOutput>,
    ...args: TInput extends void ? [input?: undefined, options?: O] : [input: Json<TInput>, options?: O]
) => Promise<Json<TOutput>>;

/**
 * Create an RPC client function.
 * @__NO_SIDE_EFFECTS__
 */
export function createClient<O = void>(clientOptions: CreateClientOptions<O>): RpcCallFunction<O> {
    return async (endpoint, ...args) => {
        const [input, options] = args as [unknown, O | undefined];
        const request = await clientOptions.request(endpoint, options);
        const headers: HttpRequestHeaders = {
            'Content-Type': 'application/json',
            ...request.headers,
        };

        const body = toJsonString(input);

        const response = await fetch(request.url, {
            method: 'POST',
            body,
            headers: headers as RequestInit['headers'],
        });

        if (!response.ok) {
            if (response.headers.get('content-type')?.includes('application/json')) {
                const data = (await response.json()) as RpcErrorData;

                console.error({ input, data });
                throw new RpcError(response, data);
            }

            const message = await response.text();
            throw new FetchError(response, message);
        }

        return (await response.json()) as Json<never>;
    };
}
