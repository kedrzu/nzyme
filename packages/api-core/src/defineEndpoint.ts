import type { HttpMethod } from '@nzyme/fetch-utils';
import type { IfAny } from '@nzyme/types';
import type * as z from '@nzyme/zchema';

import type { ObjectOptions, ValueFromOptions } from './types.js';

/**
 * Type definition for endpoint input options, which can be an object schema options or undefined.
 */
export type EndpointInputOptions = ObjectOptions | undefined;

/**
 * Type definition for endpoint output options, which can be a schema or undefined.
 */
export type EndpointOutputOptions = z.Schema | undefined;

/**
 * Represents an API endpoint definition with input/output schemas, HTTP method, and path.
 *
 * @template TInput - The input schema type
 * @template TOutput - The output schema type
 */
export type Endpoint<
    TInput extends EndpointInputOptions = EndpointInputOptions,
    TOutput extends EndpointOutputOptions = EndpointOutputOptions,
> = {
    /**
     * Schema for validating the input data.
     */
    input?: TInput;

    /**
     * HTTP method for the endpoint (GET, POST, etc).
     */
    method: HttpMethod;

    /**
     * Schema for validating and transforming the output data.
     */
    output?: TOutput;

    /**
     * URL path for the endpoint, must start with a forward slash.
     */
    path: EndpointPath;
};

/**
 * Type representing any endpoint with any input and output types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EndpointAny = Endpoint<any, any>;

/**
 * Helper type to extract the input type from an endpoint definition.
 *
 * @template T - The endpoint type
 */
export type EndpointInput<T extends EndpointAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Endpoint<infer TIn, any> ? ValueFromOptions<TIn> : never;

/**
 * Helper type to extract the output type from an endpoint definition.
 *
 * @template T - The endpoint type
 */
export type EndpointOutput<T extends EndpointAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Endpoint<any, infer TOut> ? IfAny<z.InferOr<TOut, undefined>, unknown> : undefined;

/**
 * Type for endpoint paths, which must start with a forward slash.
 */
export type EndpointPath = `/${string}`;

/**
 * Defines an endpoint for the API with proper typing.
 *
 * @template TInput - The input schema type
 * @template TOutput - The output schema type
 * @param endpoint - The endpoint configuration
 * @returns The typed endpoint definition
 */
// #__NO_SIDE_EFFECTS__
export function defineEndpoint<
    TInput extends ObjectOptions = undefined,
    TOutput extends z.Schema = z.VoidSchema,
>(endpoint: Endpoint<TInput, TOutput>) {
    return endpoint;
}
