import type { DecoratedProcedure } from '@orpc/server';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { resolveDeps } from '@nzyme/ioc';
import type { Dependencies, ServiceSetup } from '@nzyme/ioc';
import type { EmptyObject } from '@nzyme/types';

import { api } from './api.js';
import type { ApiContext } from './api.js';

/**
 * Represents an API endpoint definition with input/output schemas, HTTP method, and path.
 *
 * @template TInput - The input schema type
 * @template TOutput - The output schema type
 */
export interface EndpointOptionsBase<TDeps extends Dependencies = Dependencies> {
    /**
     * Optional dependencies needed by the handler.
     */
    readonly deps?: TDeps;
}

/**
 *
 */
export interface EndpointOptionsWithoutInput<TOutput = unknown, TDeps extends Dependencies = Dependencies>
    extends EndpointOptionsBase<TDeps> {
    /**
     * Schema for validating the input data.
     */
    readonly input?: never;

    /**
     * Handler function that processes the request.
     */
    readonly setup: ServiceSetup<TDeps, EndpointHandler<void, TOutput>>;
}

/**
 *
 */
export interface EndpointOptionsWithInput<
    TInput = unknown,
    TOutput = unknown,
    TDeps extends Dependencies = Dependencies,
> extends EndpointOptionsBase<TDeps> {
    /**
     * Schema for validating the input data.
     */
    readonly input: StandardSchemaV1<unknown, TInput>;

    /**
     * Handler function that processes the request.
     */
    readonly setup: ServiceSetup<TDeps, EndpointHandler<TInput, TOutput>>;
}

/**
 *
 */
export type EndpointDefinition<TInput = unknown, TOutput = unknown> = DecoratedProcedure<
    ApiContext,
    ApiContext,
    StandardSchemaV1<unknown, TInput>,
    StandardSchemaV1<TOutput, TOutput>,
    EmptyObject,
    EmptyObject
>;

/**
 *
 */
export interface EndpointHandler<TInput = unknown, TOutput = unknown> {
    (input: TInput): Promise<TOutput> | TOutput;
}

/**
 *
 */

/**
 *
 */
export function defineEndpoint<TInput, TOutput, TDeps extends Dependencies = EmptyObject>(
    endpoint: EndpointOptionsWithInput<TInput, TOutput, TDeps>,
): EndpointDefinition<TInput, TOutput>;
/**
 *
 */
export function defineEndpoint<TOutput, TDeps extends Dependencies = EmptyObject>(
    endpoint: EndpointOptionsWithoutInput<TOutput, TDeps>,
): EndpointDefinition<void, TOutput>;
/**
 *
 */
export function defineEndpoint(endpoint: EndpointOptionsWithInput | EndpointOptionsWithoutInput): EndpointDefinition {
    const { input, setup, deps = {} } = endpoint;
    const base = input ? api.input(input) : api;
    const key = Symbol();

    return base.handler(({ context, input }) => {
        const handler = resolveHandler(key, deps, setup as ServiceSetup<Dependencies, EndpointHandler>, context);
        return handler(input);
    });
}

function resolveHandler<TDeps extends Dependencies = EmptyObject>(
    key: symbol,
    deps: TDeps,
    setup: ServiceSetup<TDeps, EndpointHandler>,
    ctx: ApiContext,
): EndpointHandler {
    let handler = ctx.cachedHandlers.get(key);
    if (!handler) {
        const resolvedDeps = resolveDeps(deps, ctx.container);
        handler = setup(resolvedDeps);
        ctx.cachedHandlers.set(key, handler);
    }

    return handler;
}
