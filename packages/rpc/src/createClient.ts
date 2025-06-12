import { joinURL } from 'ufo';

import { FetchError } from '@nzyme/fetch-utils';
import type { HttpRequestHeaders } from '@nzyme/fetch-utils';
import type { UnionToIntersection } from '@nzyme/types';

import type { Endpoint } from './defineEndpoint.js';
import type { Serializer } from './Serializer.js';

/**
 *
 */
export interface ClientBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [endpoint: string]: (input?: any) => Promise<unknown>;
}

/**
 *
 */
export type ClientDefault<E extends Endpoint> = UnionToIntersection<
    E extends Endpoint<infer TName, infer TInput, infer TOutput>
        ? TInput extends void
            ? (endpoint: TName, input?: void) => Promise<TOutput>
            : (endpoint: TName, input: TInput) => Promise<TOutput>
        : never
>;

/**
 *
 */
export interface CreateClientOptions {
    /**
     * The base URL of the API server.
     */
    baseUrl: string;

    /**
     *
     */
    headers?: (endpoint: string) => HttpRequestHeaders | Promise<HttpRequestHeaders>;

    /**
     *
     */
    serializer: Serializer;
}

/**
 *
 */
export function createClient<C extends ClientBase>(options: CreateClientOptions): C {
    const serializer = options.serializer;
    const baseUrl = options.baseUrl;
    const headersGetter = options.headers;
    const client: Record<string, (input?: unknown) => Promise<unknown>> = {};

    const execute = async (endpoint: string, input: unknown): Promise<unknown> => {
        const url = joinURL(baseUrl, endpoint);
        const headers: HttpRequestHeaders = {
            'Content-Type': 'application/json',
        };

        if (headersGetter) {
            Object.assign(headers, await headersGetter(endpoint));
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
                fn = input => execute(endpoint, input);
                target[endpoint] = fn;
            }

            return fn;
        },
    }) as C;

    return proxy;
}
