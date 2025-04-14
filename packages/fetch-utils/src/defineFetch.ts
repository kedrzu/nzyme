import type { FetchRequest } from './fetchRequest.js';

/**
 * A fetch function configuration object that defines how to make HTTP requests and handle responses.
 */
export interface FetchOptions<TParams, TResult> {
    /**
     * Creates a fetch request configuration based on the provided parameters.
     */
    request: (params: TParams) => FetchRequest;
    /**
     * Optional function to transform the raw Response into the desired result type.
     */
    response?: (response: Response, params: TParams) => Promise<TResult>;
}

/**
 * Creates a typed fetch function with specified request and response handling.
 * Use this to define reusable fetch operations with consistent typing.
 *
 * @param fetch - The fetch configuration object
 * @returns The provided fetch configuration for use in HTTP requests
 */
// #__NO_SIDE_EFFECTS__
export function defineFetch<TParams = void, TResult = void>(fetch: FetchOptions<TParams, TResult>) {
    return fetch;
}
