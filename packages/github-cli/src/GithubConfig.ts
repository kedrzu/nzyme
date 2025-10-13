/**
 * Configuration for GitHub API access.
 */
export interface GithubConfig {
    /**
     * GitHub API token.
     */
    token: string;

    /**
     * GitHub repository owner.
     */
    owner: string;

    /**
     * GitHub repository name.
     */
    repo: string;
}
