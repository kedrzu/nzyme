import { simpleGit } from 'simple-git';

import type { GithubConfig } from '../GithubConfig.js';
import { buildPrBody, createDraftPr } from './createDraftPr.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * Result of creating a branch and PR.
 */
export interface CreateBranchAndPrResult {
    /**
     * The name of the created branch.
     */
    branch: string;
    /**
     * The created GitHub pull request.
     */
    pr: {
        body: string | null;
        html_url: string;
        id: number;
        number: number;
        title: string;
    };
}

/**
 * Parameters for creating a branch and PR.
 */
export interface CreateBranchAndPrParams {
    /**
     * GitHub client instance.
     */
    client: GithubClient;

    /**
     * GitHub configuration.
     */
    config: GithubConfig;

    /**
     * Name of the branch to create.
     */
    branchName: string;

    /**
     * Title for the pull request.
     */
    prTitle: string;

    /**
     * Description for the pull request body.
     */
    description: string;

    /**
     * Issue ID for reference.
     */
    issueId: string;

    /**
     * URL of the source issue/task.
     */
    taskUrl: string;

    /**
     * Title of the source issue/task.
     */
    issueTitle: string;

    /**
     * Base branch to create the PR against.
     */
    baseBranch?: string;
}

/**
 * Create a new git branch and GitHub PR for an issue.
 */
export async function createBranchAndPr(params: CreateBranchAndPrParams): Promise<CreateBranchAndPrResult> {
    const { client, config, branchName, prTitle, description, issueId, taskUrl, issueTitle, baseBranch } = params;
    const git = simpleGit();

    try {
        // Determine base branch - use provided baseBranch or fallback to current branch
        let resolvedBaseBranch = baseBranch;

        if (!resolvedBaseBranch) {
            const status = await git.status();
            resolvedBaseBranch = status.current || undefined;
        }

        if (!resolvedBaseBranch) {
            throw new Error('Could not determine base branch');
        }

        // Check if branch exists, create and checkout if not, otherwise just checkout
        const branches = await git.branchLocal();
        if (branches.all.includes(branchName)) {
            await git.checkout(branchName);
        } else {
            await git.checkoutLocalBranch(branchName);
        }

        // Check if the branch has any commits compared to base branch
        const diffResult = await git.diff([`${resolvedBaseBranch}...${branchName}`, '--name-only']);
        const hasCommits = diffResult.trim().length > 0;

        // If no commits, create an empty commit
        if (!hasCommits) {
            await git.commit(prTitle, [], { '--allow-empty': null });
        }

        // Push the new branch to origin
        await git.push('origin', branchName, { '--set-upstream': null });

        // Create draft PR
        const prBody = buildPrBody(description, issueId, taskUrl, issueTitle);

        const pr = await createDraftPr({
            client,
            config,
            title: prTitle,
            body: prBody,
            head: branchName,
            base: resolvedBaseBranch,
        });

        return {
            branch: branchName,
            pr,
        };
    } catch (error) {
        throw new Error(`Failed to create branch and PR: ${(error as Error).message}`);
    }
}
