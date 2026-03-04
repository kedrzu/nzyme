import { defineService } from '@nzyme/ioc/Service.js';
import type { Dependencies, Service, ServiceSetup } from '@nzyme/ioc/Service.js';
import type { SomeObject } from '@nzyme/types/Object.js';

import type { EndpointDefinition } from './defineEndpoint.js';
import type { HttpRequest } from './types/HttpRequest.js';

/**
 * Represents an API endpoint definition with input/output schemas, HTTP method, and path.
 */
export interface EndpointHandlerOptions<TInput, TOutput, TDeps extends Dependencies = Dependencies> {
    /**
     * Endpoint to define the handler for
     */
    readonly endpoint: EndpointDefinition<TInput, TOutput>;

    /**
     * Optional dependencies needed by the handler.
     */
    readonly deps?: TDeps;

    /**
     * Handler function that processes the request.
     */
    readonly setup: ServiceSetup<TDeps, EndpointHandler<TInput, TOutput>>;
}

/**
/**
 * Endpoint context
 */
export interface EndpointContext {
    /**
     * The HTTP request
     */
    request: HttpRequest;
}

/**
 * Endpoint handler function
 */
export interface EndpointHandler<TInput = unknown, TOutput = unknown> {
    (input: TInput, ctx: EndpointContext): Promise<TOutput> | TOutput;
}

/**
 * Endpoint handler service
 */
export interface EndpointHandlerService<
    TInput = unknown,
    TOutput = unknown,
    TDeps extends Dependencies = Dependencies,
> extends Service<EndpointHandler<TInput, TOutput>, TDeps> {
    /**
     * Endpoint definition
     */
    readonly endpoint: EndpointDefinition<TInput, TOutput>;
}

/**
 * Define an endpoint handler service
 */
export function defineEndpointHandler<TInput, TOutput, TDeps extends Dependencies = SomeObject>(
    options: EndpointHandlerOptions<TInput, TOutput, TDeps>,
): EndpointHandlerService<TInput, TOutput, TDeps> {
    const service = defineService({
        name: options.endpoint.name,
        deps: options.deps,
        setup: options.setup,
    });

    return {
        ...service,
        endpoint: options.endpoint,
    };
}
