import { FetchError } from '@nzyme/fetch-utils';
import type { HttpRequestHeaders } from '@nzyme/fetch-utils';
import type { ValidationErrors } from '@nzyme/validation';
import { ValidationError } from '@nzyme/validation';
import * as z from '@nzyme/zchema';

import type { Endpoint, EndpointInput, EndpointOutput } from './defineEndpoint.js';

const PATH_PARAM_REGEX = /\/:([^/]+)/g;

/**
 *
 */
export type FetchEndpointOptions<E extends Endpoint> = FetchEndpointOptionsBase<E> &
    FetchEndpointOptionsParams<E>;

type FetchEndpointOptionsBase<E extends Endpoint> = {
    endpoint: E;
    headers?: HttpRequestHeaders;
    url?: string;
};

type FetchEndpointOptionsParams<E extends Endpoint> =
    E extends Endpoint<undefined> ? { params?: undefined } : { params: EndpointInput<E> };

/**
 *
 */
export async function fetchEndpoint<E extends Endpoint>(
    options: FetchEndpointOptions<E>,
): Promise<EndpointOutput<E>> {
    const endpoint = options.endpoint;
    const params = (options.params || {}) as Record<string, unknown>;
    const headers: HttpRequestHeaders = { ...options.headers };

    const request: RequestInit = {
        method: endpoint.method,
        headers: headers as RequestInit['headers'],
    };

    if (endpoint.input) {
        if (!z.isSchema(endpoint.input)) {
            endpoint.input = z.object({ props: endpoint.input });
        }

        z.validateOrThrow(endpoint.input, params ?? {});
    }

    let url = options.url || '';
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    url += endpoint.path.replace(PATH_PARAM_REGEX, (_, param: string) => {
        const value = params[param];
        delete params[param];
        return `/${String(value)}`;
    });

    if (endpoint.method === 'GET' || endpoint.method === 'HEAD') {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            query.set(key, String(value));
        }

        if (query.size > 0) {
            url += `?${query.toString()}`;
        }
    } else {
        if (Object.keys(params).length > 0) {
            request.body = JSON.stringify(params);
            headers['Content-Type'] = 'application/json';
        }
    }

    const response = await fetch(url, request);

    if (response.status === 400) {
        const result = (await response.json()) as {
            errors: ValidationErrors;
            message: string;
        };

        throw new ValidationError(result.message, result.errors);
    }

    if (!response.ok) {
        const message = await response.text();
        throw new FetchError(response, message);
    }

    if (endpoint.output) {
        const result = await response.json();
        return z.coerce(endpoint.output, result) as EndpointOutput<E>;
    }

    return undefined as EndpointOutput<E>;
}
