import { joinURL } from 'ufo';

import { FetchError } from '@nzyme/fetch-utils';
import type { HttpRequestHeaders } from '@nzyme/fetch-utils';

import type { Serializer } from './Serializer.js';

/**
 *
 */
export interface ClientBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [endpoint: string]: (input?: any, ...rest: any[]) => Promise<unknown>;
}

/**
 *
 */
export type ClientHeadersGetter<C extends ClientBase = ClientBase> = (
    endpoint: keyof C,
    ...rest: Parameters<C[keyof C]>
) => HttpRequestHeaders | Promise<HttpRequestHeaders>;

/**
 *
 */
export interface CreateClientOptions<C extends ClientBase> {
    /**
     * The base URL of the API server.
     */
    baseUrl: string;

    /**
     *
     */
    headers?: ClientHeadersGetter<C>;

    /**
     *
     */
    serializer: Serializer;
}

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClientResult<T> = T extends (...args: any[]) => Promise<infer U> ? U : T;

/**
 *
 */
export function createClient<C extends ClientBase>(options: CreateClientOptions<C>): C {
    const serializer = options.serializer;
    const baseUrl = options.baseUrl;
    const headersGetter = options.headers as ClientHeadersGetter;
    const client: Record<string, (input: unknown, ...rest: unknown[]) => Promise<unknown>> = {};

    const execute = async (endpoint: string, input: unknown, ...rest: unknown[]): Promise<unknown> => {
        const url = joinURL(baseUrl, endpoint);
        const headers: HttpRequestHeaders = {
            'Content-Type': 'application/json',
        };

        if (headersGetter) {
            Object.assign(headers, await headersGetter(endpoint, input, ...rest));
        }

        const body = serializer(input);

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
                fn = (...args) => execute(endpoint, ...args);
                target[endpoint] = fn;
            }

            return fn;
        },
    }) as C;

    return proxy;
}
