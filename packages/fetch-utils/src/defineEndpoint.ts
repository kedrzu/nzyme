import type { FetchRequest } from './fetchRequest.js';

/**
 * Configuration for a fetch endpoint that handles both request creation and response processing.
 */
export interface Endpoint<TParams, TResult> {
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
 * A function type for processing raw HTTP responses into typed results.
 */
export interface EndpointResponse<T> {
    (response: Response): Promise<T>;
}

/**
 * Creates a typed endpoint configuration for making HTTP requests.
 * Use this to define reusable API endpoints with consistent request and response handling.
 *
 * @param endpoint - The endpoint configuration object
 * @returns The provided endpoint configuration for use in HTTP requests
 * @__NO_SIDE_EFFECTS__
 */
export function defineEndpoint<TParams = void, TResult = void>(
    endpoint: Endpoint<TParams, TResult>,
) {
    return endpoint;
}
