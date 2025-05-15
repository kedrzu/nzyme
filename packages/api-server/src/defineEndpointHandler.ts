import type { EndpointAny, EndpointInput, EndpointOutput } from '@nzyme/api-core';
import type { Service, ServiceDependencies, ServiceSetup } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';

import type { HttpRequest } from './types/HttpRequest.js';

/**
 * Represents an endpoint handler that combines endpoint definition with service functionality.
 *
 * @template E - The endpoint type
 */
export type EndpointHandler<E extends EndpointAny = EndpointAny> = E & Service<EndpointHandlerFunction<E>>;

/**
 * Function signature for handling an endpoint request.
 * Takes endpoint input and returns a promise or direct value of the endpoint output.
 *
 * @template E - The endpoint type
 */
export interface EndpointHandlerFunction<E extends EndpointAny = EndpointAny> {
    (input: EndpointInput<E>, request: HttpRequest): EndpointOutput<E> | Promise<EndpointOutput<E>>;
}

/**
 * Configuration options for defining an endpoint handler.
 *
 * @template TEndpoint - The endpoint type
 * @template TDeps - The service dependencies
 */
export interface EndpointHandlerOptions<
    TEndpoint extends EndpointAny = EndpointAny,
    TDeps extends ServiceDependencies = ServiceDependencies,
> {
    /**
     * The endpoint definition to handle.
     */
    readonly endpoint: TEndpoint;
    /**
     * Optional dependencies needed by the handler.
     */
    readonly deps?: TDeps;
    /**
     * Setup function that configures how the handler processes requests.
     */
    readonly setup: ServiceSetup<TDeps, EndpointHandlerFunction<TEndpoint>>;
}

/**
 * Defines a handler for an API endpoint, combining endpoint definition with implementation.
 *
 * @template E - The endpoint type
 * @template D - The service dependencies
 * @param options - Configuration options for the endpoint handler
 * @returns A combined endpoint and service object
 * @__NO_SIDE_EFFECTS__
 */
export function defineEndpointHandler<E extends EndpointAny, D extends ServiceDependencies>(
    options: EndpointHandlerOptions<E, D>,
): EndpointHandler<E> {
    return {
        ...options.endpoint,
        ...defineService({
            deps: options.deps,
            name: `endpoint:${options.endpoint.path}`,
            setup: options.setup,
        }),
    };
}
