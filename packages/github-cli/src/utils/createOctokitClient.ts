import { Octokit } from '@octokit/rest';

import type { GitHubConfig } from '../index.js';

/**
 * Create a GitHub API client.
 * @__NO_SIDE_EFFECTS__
 */
export function createOctokitClient(config: GitHubConfig): Octokit {
    return new Octokit({
        auth: config.token,
    });
}
