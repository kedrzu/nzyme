import { LinearClient } from '@linear/sdk';

/**
 * Options for creating a Linear client.
 */
export interface CreateLinearClientOptions {
    /**
     * Linear API token.
     */
    apiToken: string;
}

/**
 * Create a Linear API client.
 * @__NO_SIDE_EFFECTS__
 */
export function createLinearClient({ apiToken }: CreateLinearClientOptions): LinearClient {
    return new LinearClient({
        apiKey: apiToken,
    });
}
