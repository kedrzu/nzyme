import type { FetchRequest } from './fetchRequest.js';

/**
 * A fetch endpoint.
 */
export interface Endpoint<TParams, TResult> {
    /**
     * The request for the endpoint.
     */
    request: (params: TParams) => FetchRequest;
    /**
     * The response for the endpoint.
     */
    response?: (response: Response, params: TParams) => Promise<TResult>;
}

/**
 * A function that takes a response and returns a promise of a result.
 */
export interface EndpointResponse<T> {
    (response: Response): Promise<T>;
}

/**
 * Define a fetch endpoint.
 *
 * #__NO_SIDE_EFFECTS__
 */
export function defineEndpoint<TParams = void, TResult = void>(
    endpoint: Endpoint<TParams, TResult>,
) {
    return endpoint;
}
