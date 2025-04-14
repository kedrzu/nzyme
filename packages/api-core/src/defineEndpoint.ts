import type { HttpMethod } from '@nzyme/fetch-utils';
import type { IfAny } from '@nzyme/types';
import type * as z from '@nzyme/zchema';

import type { ObjectOptions, ValueFromOptions } from './types.js';

/**
 *
 */
export type Endpoint<
    TInput extends ObjectOptions | undefined = ObjectOptions | undefined,
    TOutput extends undefined | z.Schema = undefined | z.Schema,
> = {
    /**
     *
     */
    input?: TInput;

    /**
     *
     */
    method: HttpMethod;

    /**
     *
     */
    output?: TOutput;

    /**
     *
     */
    path: EndpointPath;
};

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EndpointAny = Endpoint<any, any>;

/**
 *
 */
export type EndpointInput<T extends EndpointAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Endpoint<infer TIn, any> ? ValueFromOptions<TIn> : never;

/**
 *
 */
export type EndpointOutput<T extends EndpointAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Endpoint<any, infer TOut> ? IfAny<z.InferOr<TOut, undefined>, unknown> : undefined;

/**
 *
 */
export type EndpointPath = `/${string}`;

/**
 * Defines an endpoint for the API.
 */
export function defineEndpoint<
    TInput extends ObjectOptions = undefined,
    TOutput extends z.Schema = z.VoidSchema,
>(endpoint: Endpoint<TInput, TOutput>) {
    return endpoint;
}
