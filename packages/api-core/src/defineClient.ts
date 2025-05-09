import type { Endpoint, EndpointInput, EndpointOutput } from './defineEndpoint.js';

/**
 * Type definition for a fetch client that can execute endpoints with or without parameters.
 * Provides type-safe overloads for parameterless and parameterized endpoints.
 */
export interface ApiClient {
    /**
     * Executes an endpoint that doesn't require parameters
     */
    <E extends Endpoint<undefined>>(endpoint: E): Promise<EndpointOutput<E>>;
    /**
     * Executes an endpoint with the specified parameters
     */
    <E extends Endpoint>(endpoint: E, params: EndpointInput<E>): Promise<EndpointOutput<E>>;
}

/**
 * Internal type for the raw fetch client implementation
 */
interface FetchClientInput {
    (endpoint: Endpoint, params?: unknown): Promise<unknown>;
}

/**
 * Creates a type-safe fetch client from a raw implementation.
 * The client can be used to execute endpoints with proper type checking.
 *
 * @param client - The raw fetch client implementation
 * @returns A typed fetch client for executing endpoints
 * @__NO_SIDE_EFFECTS__
 */
export function defineClient(client: FetchClientInput) {
    return client as ApiClient;
}
