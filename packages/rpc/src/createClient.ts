import { FetchError } from '@nzyme/fetch-utils';
import type { HttpRequestHeaders } from '@nzyme/fetch-utils';
import type { UnionToIntersection } from '@nzyme/types';
import { toJsonString } from '@nzyme/utils';

import type { Endpoint } from './defineEndpoint.js';
import type { Serialized } from './Serialized.js';
import { RpcError } from './types/RpcError.js';
import type { RpcErrorData } from './types/RpcError.js';

/**
 *
 */
export interface RpcClientBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [endpoint: string]: (input?: any, ...rest: any[]) => Promise<unknown>;
}

/**
 *
 */
export type RpcClientGetter<T, O> = (endpoint: string, input: unknown, options?: O) => Promise<T> | T;

/**
 *
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
 *
 */
export interface CreateClientOptions<O> {
    /**
     * The function to get the request configuration.
     */
    request: RpcClientGetter<RpcClientRequest, O>;
}

/**
 *
 */
export type RpcClient<E extends Endpoint, O> = UnionToIntersection<
    E extends Endpoint<infer TName, infer TInput, infer TOutput>
        ? TInput extends void
            ? { [K in TName]: (input?: void, options?: O) => Promise<Serialized<TOutput>> }
            : { [K in TName]: (input: Serialized<TInput>, options?: O) => Promise<Serialized<TOutput>> }
        : never
>;

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcResult<T> = T extends (...args: any[]) => Promise<infer U> ? U : T;

/**
 *
 */
export function createClient<E extends Endpoint, O = void>(clientOptions: CreateClientOptions<O>): RpcClient<E, O> {
    const client: Record<string, (input: unknown, ...rest: unknown[]) => Promise<unknown>> = {};

    const execute = async (endpoint: string, input: unknown, options?: O): Promise<unknown> => {
        const request = await clientOptions.request(endpoint, input, options);
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
                throw new RpcError(response, data);
            }

            const message = await response.text();
            throw new FetchError(response, message);
        }

        return await response.json();
    };

    const proxy = new Proxy(client, {
        get(target, endpoint: string) {
            let fn = target[endpoint];
            if (!fn) {
                fn = (input, options) => execute(endpoint, input, options as O | undefined);
                target[endpoint] = fn;
            }

            return fn;
        },
    }) as RpcClient<E, O>;

    return proxy;
}
