import { LinearClient } from '@linear/sdk';

import type { LinearConfig } from '../cli/defineLinearCommands.js';

/**
 * Create a Linear API client.
 * @__NO_SIDE_EFFECTS__
 */
export function createLinearClient(config: LinearConfig): LinearClient {
    return new LinearClient({
        apiKey: config.apiToken,
    });
}
