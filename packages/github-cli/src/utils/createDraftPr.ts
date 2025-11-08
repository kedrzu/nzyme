import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * Parameters for creating a draft PR.
 */
export interface CreateDraftPrParams {
    /**
     * GitHub client instance.
     */
    client: GithubClient;

    /**
     * GitHub configuration.
     */
    config: GithubConfig;

    /**
     * Title for the pull request.
     */
    title: string;

    /**
     * Body for the pull request.
     */
    body: string;

    /**
     * Head branch name.
     */
    head: string;

    /**
     * Base branch name.
     */
    base: string;
}

/**
 * Result of creating a draft PR.
 */
export interface CreateDraftPrResult {
    /**
     * The created GitHub pull request.
     */
    body: string | null;
    /**
     *
     */
    html_url: string;
    /**
     *
     */
    id: number;
    /**
     *
     */
    number: number;
    /**
     *
     */
    title: string;
}

/**
 * Create a draft GitHub pull request.
 * @__NO_SIDE_EFFECTS__
 */
export async function createDraftPr(params: CreateDraftPrParams): Promise<CreateDraftPrResult> {
    const { client, config, title, body, head, base } = params;

    const { data: pr } = await client.rest.pulls.create({
        owner: config.owner,
        repo: config.repo,
        title,
        head,
        base,
        body,
        draft: true,
    });

    return {
        body: pr.body,
        html_url: pr.html_url,
        id: pr.id,
        number: pr.number,
        title: pr.title,
    };
}

/**
 * Build a PR body with task information.
 * @__NO_SIDE_EFFECTS__
 */
export function buildPrBody(description: string, issueId: string, taskUrl: string, issueTitle: string): string {
    const lines = [`# [${issueId}](${taskUrl}) ${issueTitle}`, ''];

    if (description) {
        lines.push(description);
    }

    return lines.join('\n');
}
