/**
 * Core types for OpenAPI fetch client
 */

import type { HttpMethod } from '@nzyme/fetch-utils';
import type { IfNever } from '@nzyme/types';

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
 *
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
 *
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
 * Create discriminated union of all possible responses
 */
export type OpenApiResponseUnion<Responses> = {
    [K in keyof Responses]: ResponseForStatus<Responses, K>;
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
 * Extract response data for a specific status code
 */
type ResponseDataForStatus<Responses, Status extends keyof Responses> = Responses[Status] extends { content: infer C }
    ? C extends Record<string, unknown>
        ? BodyType<C, FirstContentType<C>>
        : void
    : void;

// &
// (IsRequestBodyRequired<RequestBody> extends true
//     ? {
//           /** Request body (required) */
//           body: BodyForContentType<RequestBody, ContentType>;
//       }
//     : ContentTypes<RequestBody> extends never
//       ? Record<string, never>
//       : {
//             /** Request body (optional) */
//             body?: BodyForContentType<RequestBody, ContentType>;
//         });

/**
 * Create a response object for a specific status
 */
type ResponseForStatus<Responses, Status extends keyof Responses> = {
    data: ResponseDataForStatus<Responses, Status>;
    response: Response;
    status: Status extends string
        ? Status extends `${infer N}`
            ? N extends `${number}`
                ? number
                : Status
            : Status
        : Status;
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
    ParametersOf<OperationOf<Paths, Path, Method>> extends { path: infer P }
        ? {
              pathParams: P;
          }
        : {
              pathParams?: undefined;
          };

type FetchOptionsContentType<ContentType extends string> = IfNever<
    ContentType,
    { contentType?: undefined },
    { contentType: ContentType }
>;

type FetchOptionsBody<Paths, Path extends keyof Paths, Method extends HttpMethod, ContentType> =
    RequestBodyOf<OperationOf<Paths, Path, Method>> extends { content: infer C }
        ? C extends Record<string, unknown>
            ? ContentType extends keyof C
                ? { body: C[ContentType] }
                : { body?: BodyInit }
            : { body?: BodyInit }
        : Exclude<RequestBodyOf<OperationOf<Paths, Path, Method>>, undefined> extends { content: infer C }
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
