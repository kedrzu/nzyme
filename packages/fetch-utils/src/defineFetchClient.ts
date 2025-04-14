import type { Endpoint } from './defineEndpoint.js';

/**
 * Type definition for a fetch client that can execute endpoints with or without parameters.
 * Provides type-safe overloads for parameterless and parameterized endpoints.
 */
export interface FetchClient {
    /**
     * Executes an endpoint that doesn't require parameters
     */
    <TResult>(endpoint: Endpoint<void, TResult>): Promise<TResult>;
    /**
     * Executes an endpoint with the specified parameters
     */
    <TParams, TResult>(endpoint: Endpoint<TParams, TResult>, params: TParams): Promise<TResult>;
}

/**
 * Internal type for the raw fetch client implementation
 */
interface FetchClientInput {
    (endpoint: Endpoint<unknown, unknown>, params?: unknown): Promise<unknown>;
}

/**
 * Creates a type-safe fetch client from a raw implementation.
 * The client can be used to execute endpoints with proper type checking.
 *
 * @param client - The raw fetch client implementation
 * @returns A typed fetch client for executing endpoints
 */
// #__NO_SIDE_EFFECTS__
export function defineFetchClient(client: FetchClientInput) {
    return client as FetchClient;
}
