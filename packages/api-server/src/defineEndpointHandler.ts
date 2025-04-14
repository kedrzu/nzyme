import type { EndpointAny, EndpointInput, EndpointOutput } from '@nzyme/api-core';
import type { Service, ServiceDependencies, ServiceSetup } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';

/**
 *
 */
export type EndpointHandler<E extends EndpointAny = EndpointAny> = E &
    Service<EndpointHandlerFunction<E>>;

/**
 *
 */
export interface EndpointHandlerFunction<E extends EndpointAny = EndpointAny> {
    (input: EndpointInput<E>): EndpointOutput<E> | Promise<EndpointOutput<E>>;
}

/**
 *
 */
export interface EndpointHandlerOptions<
    E extends EndpointAny = EndpointAny,
    D extends ServiceDependencies = ServiceDependencies,
> {
    /**
     *
     */
    readonly deps?: D;
    /**
     *
     */
    readonly setup: ServiceSetup<EndpointHandlerFunction<E>, D>;
}

/**
 *
 */
// #__NO_SIDE_EFFECTS__*/
export function defineEndpointHandler<E extends EndpointAny>(
    endpoint: E,
    options: EndpointHandlerOptions<E>,
): EndpointHandler<E> {
    return {
        ...endpoint,
        ...defineService({
            deps: options.deps,
            name: `endpoint:${endpoint.path}`,
            setup: options.setup,
        }),
    };
}
