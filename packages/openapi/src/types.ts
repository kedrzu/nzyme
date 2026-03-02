/**
 * Core types for OpenAPI fetch client
 */

import type { BodyInit } from 'undici-types';

import type { HttpMethod } from '@nzyme/fetch-utils/HttpMethod.js';
import type { IfNever } from '@nzyme/types/TypeGuards.js';

/**
 * Extract paths from OpenAPI schema
 */
export type PathsOf<T> = T extends { paths: infer P } ? P : never;

/**
 * Extract operations for a specific path and method
 */
export type OperationOf<Paths, Path extends keyof Paths, Method extends HttpMethod> =
    Paths[Path] extends Record<string, unknown> ? Paths[Path][Lowercase<Method>] : never;

/**
 * Extract parameters from an operation
 */
export type ParametersOf<Operation> = Operation extends { parameters: infer P } ? P : never;

/**
 * Extract content type from an operation's request body
 */
export type ContentTypeOf<Operation> =
    Exclude<RequestBodyOf<Operation>, undefined> extends { content: infer C }
        ? C extends Record<string, unknown>
            ? keyof C
            : never
        : never;

/**
 * Extract request body from an operation
 */
export type RequestBodyOf<Operation> = Operation extends { requestBody: infer R }
    ? R
    : Operation extends { requestBody?: infer R }
      ? R | undefined
      : never;

/**
 * Extract request body content for a specific content type
 */
export type RequestBodyContentOf<Operation, ContentType> =
    RequestBodyOf<Operation> extends { content: infer C }
        ? ContentType extends keyof C
            ? C[ContentType]
            : BodyInit | undefined
        : RequestBodyOf<Operation> extends { content: infer C } | undefined
          ? ContentType extends keyof C
              ? C[ContentType] | undefined
              : BodyInit | undefined
          : BodyInit | undefined;

/**
 * Extract responses from an operation
 */
export type ResponsesOf<Operation> = Operation extends { responses: infer R } ? R : never;

/**
 * Extract path parameters
 */
export type PathParams<Parameters> = Parameters extends { path: infer P } ? P : never;

/**
 * Extract query parameters
 */
export type QueryParams<Parameters> = Parameters extends { query: infer Q } ? Q : never;

/**
 * Extract header parameters
 */
export type HeaderParams<Parameters> = Parameters extends { header: infer H } ? H : never;

/**
 * Extract request body content
 */
export type RequestBodyContent<RequestBody> = RequestBody extends { content: infer C } ? C : never;

/**
 * Extract response content for a specific status code
 */
export type ResponseContent<Responses, Status extends keyof Responses> = Responses[Status] extends { content: infer C }
    ? C
    : never;

/**
 * Extract available content types from request body
 */
export type ContentTypes<RequestBody> = RequestBody extends { content: infer C }
    ? C extends Record<string, unknown>
        ? keyof C
        : never
    : never;

/**
 * Extract the first available content type from request body
 */
export type FirstContentType<Content> =
    Content extends Record<string, unknown> ? (keyof Content extends string ? keyof Content : never) : never;

/**
 * Extract body type from request body content
 */
export type BodyType<Content, ContentType extends keyof Content> = Content[ContentType];

/**
 * Create discriminated union of all possible responses by status and content type
 */
export type OpenApiResponseUnion<Responses> = {
    [Status in keyof Responses]: ResponseContentTypes<Responses[Status]> extends never
        ? ResponseForStatusNoContent<Responses, Status>
        : {
              [ContentType in ResponseContentTypes<Responses[Status]>]: ResponseForStatusAndContentType<
                  Responses,
                  Status,
                  ContentType
              >;
          }[ResponseContentTypes<Responses[Status]>];
}[keyof Responses];

/**
 * Options for making an OpenAPI fetch request
 *
 * This type provides full type safety based on the OpenAPI schema, including:
 * - Required path parameters when the path contains `{param}`
 * - Typed query parameters from the operation
 * - Typed headers combining OpenAPI header params and custom headers
 * - Typed request body based on selected content type
 * - Content type selection from available types in the schema
 *
 * @template Paths - The OpenAPI paths object type
 * @template Path - The specific path being requested
 * @template Method - The HTTP method
 * @template ContentType - The content type for request body
 */
export type OpenApiFetchOptions<
    Paths,
    Path extends keyof Paths,
    Method extends HttpMethod,
    ContentType extends ContentTypeOf<OperationOf<Paths, Path, Method>>,
> = FetchOptionsBase<Paths, Path, Method> &
    FetchOptionsBody<Paths, Path, Method, ContentType> &
    FetchOptionsContentType<ContentType> &
    FetchOptionsPathParams<Paths, Path, Method>;

/**
 * OpenAPI fetch response as discriminated union by status code
 *
 * This type represents all possible responses for an OpenAPI operation as a
 * discriminated union. Each possible status code has its own response type
 * with properly typed data based on the OpenAPI schema.
 *
 * This enables perfect type narrowing based on the status code:
 *
 * @example
 * ```typescript
 * const result = await apiClient({ method: 'GET', path: '/pet/{id}', pathParams: { id: 1 } });
 *
 * if (result.status === 200) {
 *   // result.data is typed as Pet
 *   console.log(result.data.name);
 * } else if (result.status === 404) {
 *   // result.data is typed as NotFoundError
 *   console.log(result.data.message);
 * }
 * ```
 *
 * @template Paths - The OpenAPI paths object type
 * @template Path - The specific path being requested
 * @template Method - The HTTP method
 */
export type OpenApiFetchResponse<
    Paths,
    Path extends keyof Paths,
    Method extends HttpMethod,
    Operation = OperationOf<Paths, Path, Method>,
    Responses = ResponsesOf<Operation>,
> = OpenApiResponseUnion<Responses>;

/**
 * Extract all content types from a response
 */
type ResponseContentTypes<Response> = Response extends { content: infer C }
    ? C extends Record<string, unknown>
        ? keyof C
        : never
    : never;

/**
 * Extract response data for a specific status code and content type
 */
type ResponseDataForStatusAndContentType<
    Responses,
    Status extends keyof Responses,
    ContentType,
> = Responses[Status] extends { content: infer C }
    ? C extends Record<string, unknown>
        ? ContentType extends keyof C
            ? ContentType extends 'text/event-stream'
                ? undefined
                : C[ContentType]
            : void
        : void
    : void;

/**
 * Normalize status code to number when possible
 */
type NormalizeStatus<Status> = Status extends string
    ? Status extends `${infer N}`
        ? N extends `${number}`
            ? number
            : Status
        : Status
    : Status;

/**
 * Create a response object for a specific status and content type
 */
type ResponseForStatusAndContentType<Responses, Status extends keyof Responses, ContentType> = {
    data: ResponseDataForStatusAndContentType<Responses, Status, ContentType>;
    response: Response;
    status: NormalizeStatus<Status>;
    contentType: ContentType;
};

/**
 * Create a response object for a specific status with no content
 */
type ResponseForStatusNoContent<Responses, Status extends keyof Responses> = {
    data: void;
    response: Response;
    status: NormalizeStatus<Status>;
    contentType: undefined;
};

interface FetchOptionsBase<Paths, Path extends keyof Paths, Method extends HttpMethod> {
    /** Base URL for the API */
    baseUrl?: string;
    /** Fetch options */
    fetchOptions?: Omit<RequestInit, 'body' | 'headers' | 'method'>;
    /** Headers (OpenAPI header params + additional headers) */
    headers?: HeadersFromParams<ParametersOf<OperationOf<Paths, Path, Method>>>;
    /** API path */
    path: Path;
    /** HTTP method */
    method: Method;
    /** Query parameters */
    query?: QueryParams<ParametersOf<OperationOf<Paths, Path, Method>>>;
}

type FetchOptionsPathParams<Paths, Path extends keyof Paths, Method extends HttpMethod> =
    [ParametersOf<OperationOf<Paths, Path, Method>>] extends [never]
        ? { pathParams?: undefined }
        : ParametersOf<OperationOf<Paths, Path, Method>> extends { path: infer P }
          ? { pathParams: P }
          : { pathParams?: undefined };

type FetchOptionsContentType<ContentType extends string> = IfNever<
    ContentType,
    { contentType?: undefined },
    { contentType: ContentType }
>;

type FetchOptionsBody<Paths, Path extends keyof Paths, Method extends HttpMethod, ContentType> =
    [ContentType] extends [never]
        ? { body?: never }
        : RequestBodyOf<OperationOf<Paths, Path, Method>> extends { content: infer C }
          ? C extends Record<string, unknown>
              ? ContentType extends keyof C
                  ? { body: C[ContentType] }
                  : { body?: BodyInit }
              : { body?: BodyInit }
          : [Exclude<RequestBodyOf<OperationOf<Paths, Path, Method>>, undefined>] extends [{ content: infer C }]
            ? C extends Record<string, unknown>
                ? ContentType extends keyof C
                    ? { body?: C[ContentType] }
                    : { body?: BodyInit }
                : { body?: BodyInit }
            : { body?: BodyInit };

/**
 * Merge OpenAPI header parameters with additional headers
 */
type HeadersFromParams<Parameters> = Parameters extends { header: infer H }
    ? H extends Record<string, unknown>
        ? HeadersOmitContentType<H> & Record<string, string>
        : Record<string, string>
    : Record<string, string>;

type HeadersOmitContentType<H> = {
    [K in keyof H as K extends string ? (Lowercase<K> extends 'content-type' ? never : K) : never]: H[K];
};
