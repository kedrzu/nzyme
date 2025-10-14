import { joinURL } from 'ufo';

import { FetchError } from '@nzyme/fetch-utils';
import type { HttpRequestHeaders } from '@nzyme/fetch-utils';
import type { UnionToIntersection } from '@nzyme/types';
import { toJsonString } from '@nzyme/utils';

import type { Endpoint } from './defineEndpoint.js';
import type { Serialized } from './Serialized.js';

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
export interface CreateClientOptions<O> {
    /**
     * The base URL of the API server.
     */
    url: string | RpcClientGetter<string, O>;

    /**
     *
     */
    headers?: RpcClientGetter<HttpRequestHeaders, O>;
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
export function createClient<E extends Endpoint, O = void>(options: CreateClientOptions<O>): RpcClient<E, O> {
    const urlGetter = createUrlGetter(options.url);
    const headersGetter = options.headers as RpcClientGetter<HttpRequestHeaders, O>;
    const client: Record<string, (input: unknown, ...rest: unknown[]) => Promise<unknown>> = {};

    const execute = async (endpoint: string, input: unknown, options?: O): Promise<unknown> => {
        const url = await urlGetter(endpoint, input, options);
        const headers: HttpRequestHeaders = {
            'Content-Type': 'application/json',
        };

        if (headersGetter) {
            Object.assign(headers, await headersGetter(endpoint, input, options));
        }

        const body = toJsonString(input);

        const response = await fetch(url, {
            method: 'POST',
            body,
            headers: headers as RequestInit['headers'],
        });

        if (!response.ok) {
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

function createUrlGetter<O>(url: string | RpcClientGetter<string, O>): RpcClientGetter<string, O> {
    if (typeof url === 'function') {
        return url;
    }

    return endpoint => joinURL(url, endpoint);
}
