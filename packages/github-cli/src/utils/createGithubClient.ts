import { Octokit } from '@octokit/rest';

import type { GithubConfig } from '../GithubConfig.js';

/**
 * GitHub API client.
 */
export type GithubClient = Octokit;

/**
 * Create a GitHub API client.
 * @__NO_SIDE_EFFECTS__
 */
export function createGithubClient(config: GithubConfig): GithubClient {
    return new Octokit({
        auth: config.token,
    });
}
