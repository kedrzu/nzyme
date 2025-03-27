import type { FetchRequest } from './fetchRequest.js';

/**
 * A fetch function.
 */
export interface FetchOptions<TParams, TResult> {
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
 * Define a fetch function.
 *
 * #__NO_SIDE_EFFECTS__
 */
export function defineFetch<TParams = void, TResult = void>(fetch: FetchOptions<TParams, TResult>) {
    return fetch;
}
