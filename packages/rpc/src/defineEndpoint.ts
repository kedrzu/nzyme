import type { StandardSchemaV1 } from '@standard-schema/spec';

import { defineService } from '@nzyme/ioc';
import type { Dependencies, Service, ServiceSetup } from '@nzyme/ioc';
import type { EmptyObject, IfAny } from '@nzyme/types';

import type { HttpRequest } from './types/HttpRequest.js';

/**
 * Represents an API endpoint definition with input/output schemas, HTTP method, and path.
 */
export interface EndpointOptionsBase<TName extends string, TDeps extends Dependencies = Dependencies> {
    /**
     * The name of the endpoint.
     */
    readonly name: TName;

    /**
     * Optional dependencies needed by the handler.
     */
    readonly deps?: TDeps;
}

/**
 *
 */
export interface EndpointOptionsWithoutInput<
    TName extends string = string,
    TOutput = unknown,
    TDeps extends Dependencies = Dependencies,
> extends EndpointOptionsBase<TName, TDeps> {
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
    TName extends string = string,
    TInput = unknown,
    TOutput = unknown,
    TDeps extends Dependencies = Dependencies,
> extends EndpointOptionsBase<TName, TDeps> {
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
 * Endpoint context
 */
export interface EndpointContext {
    /**
     * The HTTP request
     */
    request: HttpRequest;
}

const EndpointSymbol = Symbol('Endpoint');

/**
 * Endpoint handler function
 */
export interface EndpointHandler<TInput = unknown, TOutput = unknown> {
    (input: TInput, ctx: EndpointContext): Promise<TOutput> | TOutput;
}

/**
 *
 */
export interface Endpoint<
    TName extends string = string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TInput = any,
    TOutput = unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TDeps extends Dependencies = any,
> extends Service<EndpointHandler<TInput, TOutput>, TDeps> {
    /**
     *
     */
    readonly name: TName;

    /**
     *
     */
    readonly input: IfAny<
        TInput,
        StandardSchemaV1 | undefined,
        void extends TInput ? undefined : StandardSchemaV1<unknown, TInput>
    >;

    /**
     *
     */
    [EndpointSymbol]: true;
}

/**
 *
 */
export type EndpointName<E extends Endpoint> = E['name'];

/**
 * Filter out all the non-endpoint exports from an object.
 */
export type EndpointFromExports<T extends object> = EndpointGuard & T[keyof T];

/**
 *
 */
export interface EndpointGuard {
    /**
     *
     */
    [EndpointSymbol]: true;
}

/**
 *
 */
export type EndpointInput<E extends Endpoint> =
    E extends Endpoint<string, infer TInput, infer _TOutput, infer _TDeps> ? IfAny<TInput, unknown> : never;

/**
 *
 */
export type EndpointOutput<E extends Endpoint> =
    E extends Endpoint<string, infer _TInput, infer TOutput, infer _TDeps> ? IfAny<TOutput, unknown> : never;

/**
 *
 */
export function defineEndpoint<TName extends string, TInput, TOutput, TDeps extends Dependencies = EmptyObject>(
    endpoint: EndpointOptionsWithInput<TName, TInput, TOutput, TDeps>,
): Endpoint<TName, TInput, TOutput, TDeps>;
/**
 *
 */
export function defineEndpoint<TName extends string, TOutput, TDeps extends Dependencies = EmptyObject>(
    endpoint: EndpointOptionsWithoutInput<TName, TOutput, TDeps>,
): Endpoint<TName, undefined, TOutput, TDeps>;
/**
 *
 */
export function defineEndpoint(endpoint: EndpointOptionsWithInput | EndpointOptionsWithoutInput): Endpoint {
    const service = defineService({
        name: endpoint.name,
        deps: endpoint.deps,
        setup: endpoint.setup,
    });

    return {
        ...(service as Endpoint),
        input: endpoint.input,
        [EndpointSymbol]: true,
    };
}
