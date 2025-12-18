import { joinURL, withQuery } from 'ufo';

import type { HttpMethod } from '@nzyme/fetch-utils';
import { isPlainObject } from '@nzyme/utils';

import type { ContentTypeOf, OpenApiFetchOptions, OpenApiFetchResponse, OperationOf } from './types.js';

/**
 * Configuration options for creating an OpenAPI fetch client
 *
 * @example
 * ```typescript
 * const client = createOpenApiFetch({
 *   baseUrl: 'https://api.example.com',
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 * ```
 */
export interface OpenApiFetchConfig {
    /** Base URL for all requests */
    baseUrl?: string;
    /** Default headers to include in all requests */
    headers?: Record<string, string>;
    /** Custom fetch implementation */
    fetch?: typeof fetch;
}

/**
 * Create an OpenAPI fetch client with default configuration
 *
 * @param config - Configuration options for the client
 * @returns A typed fetch function for the given OpenAPI schema
 *
 * @example
 * ```typescript
 * import type { paths } from './api-schema';
 *
 * const apiClient = createOpenApiFetch<paths>({
 *   baseUrl: 'https://api.example.com',
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * const result = await apiClient({
 *   method: 'GET',
 *   path: '/pets/{id}',
 *   pathParams: { id: 123 }
 * });
 * ```
 */
export function createOpenApiFetch<Paths>(config: OpenApiFetchConfig = {}) {
    const { baseUrl = '', headers: defaultHeaders = {}, fetch: customFetch = fetch } = config;

    /**
     * Make a typed OpenAPI request
     */
    return async function openApiFetch<
        const Path extends keyof Paths,
        const Method extends HttpMethod,
        const ContentType extends ContentTypeOf<OperationOf<Paths, Path, Method>>,
    >(
        options: OpenApiFetchOptions<Paths, Path, Method, ContentType>,
    ): Promise<OpenApiFetchResponse<Paths, Path, Method>> {
        const {
            method,
            path,
            baseUrl: requestBaseUrl,
            pathParams,
            query,
            contentType,
            headers: requestHeaders = {},
            fetchOptions = {},
        } = options;

        let body = options.body as object | BodyInit | null | undefined;

        // Build URL
        const finalBaseUrl = requestBaseUrl ?? baseUrl;
        let url = joinURL(finalBaseUrl, path as string);

        // Replace path parameters
        if (pathParams) {
            for (const [key, value] of Object.entries(pathParams as Record<string, unknown>)) {
                url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
            }
        }

        // Add query parameters
        if (query) {
            url = withQuery(url, query as Record<string, boolean | number | string | undefined>);
        }

        // Prepare headers
        const headers = new Headers({
            ...defaultHeaders,
            ...(requestHeaders as Record<string, string>),
        });

        // Prepare request body and content type
        if (body !== undefined) {
            const finalContentType = contentType || 'application/json';

            if (!headers.has('content-type')) {
                headers.set('content-type', finalContentType);
            }

            // Serialize body based on content type
            if (finalContentType.includes('application/json')) {
                if (body === null || Array.isArray(body) || isPlainObject(body)) {
                    body = JSON.stringify(body);
                }
            } else if (finalContentType.includes('application/x-www-form-urlencoded')) {
                if (!isPlainObject(body)) {
                    throw new Error('Body must be an object');
                }

                const urlSearchParams = new URLSearchParams();
                for (const [key, value] of Object.entries(body)) {
                    if (value !== undefined && value !== null) {
                        switch (typeof value) {
                            case 'boolean':
                            case 'number':
                            case 'string':
                                urlSearchParams.append(key, String(value));
                                break;
                            default:
                                urlSearchParams.append(key, JSON.stringify(value));
                                break;
                        }
                    }
                }

                body = urlSearchParams;
            } else if (finalContentType.includes('multipart/form-data')) {
                if (!isPlainObject(body)) {
                    throw new Error('Body must be an object');
                }

                const formData = new FormData();
                for (const [key, value] of Object.entries(body)) {
                    if (value !== undefined && value !== null) {
                        if (value instanceof File || value instanceof Blob) {
                            formData.append(key, value);
                            continue;
                        }

                        switch (typeof value) {
                            case 'boolean':
                            case 'number':
                                formData.append(key, String(value));
                                break;
                            case 'string':
                                formData.append(key, value);
                                break;
                            default:
                                formData.append(key, JSON.stringify(value));
                                break;
                        }
                    }
                }

                body = formData;
            }
        }

        // Make the request
        const response = await customFetch(url, {
            method,
            headers,
            redirect: 'manual',
            body: body as BodyInit | undefined,
            ...fetchOptions,
        });

        // Parse response based on content type
        const responseContentTypeHeader = response.headers.get('content-type') || '';
        // Strip parameters (e.g., "application/json; charset=utf-8" → "application/json")
        const responseContentType = responseContentTypeHeader.split(';')[0]?.trim() || undefined;
        let data: unknown;

        if (responseContentType === 'text/event-stream') {
            // Don't consume the stream - let the caller use response.body
            data = undefined;
        } else if (responseContentType?.includes('application/json') || responseContentType?.includes('+json')) {
            data = await response.json();
        } else if (responseContentType?.includes('text/')) {
            data = await response.text();
        } else if (response.status !== 204) {
            // For non-JSON, non-text responses that are not No Content
            data = await response.blob();
        } else {
            // No content response
            data = undefined;
        }

        return {
            status: response.status as OpenApiFetchResponse<Paths, Path, Method>['status'],
            contentType: responseContentType as OpenApiFetchResponse<Paths, Path, Method>['contentType'],
            data: data as OpenApiFetchResponse<Paths, Path, Method>['data'],
            response,
        };
    };
}
