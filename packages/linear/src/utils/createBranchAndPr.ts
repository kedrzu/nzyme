import type { Octokit } from '@octokit/rest';
import { simpleGit } from 'simple-git';

import type { GitHubConfig } from '../cli/defineLinearCommands.js';

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
 * Create a new git branch and GitHub PR for a Linear issue.
 * @__NO_SIDE_EFFECTS__
 */
export async function createBranchAndPr(
    octokit: Octokit,
    config: GitHubConfig,
    branchName: string,
    prTitle: string,
    description: string,
    issueId: string,
): Promise<CreateBranchAndPrResult> {
    const git = simpleGit();

    try {
        // Get current branch (usually main/master)
        const status = await git.status();
        const baseBranch = status.current;

        if (!baseBranch) {
            throw new Error('Could not determine current branch');
        }

        // Ensure we're on the latest version of the base branch
        await git.pull('origin', baseBranch);

        // Create and checkout new branch
        await git.checkoutLocalBranch(branchName);

        // Push the new branch to origin
        await git.push('origin', branchName, { '--set-upstream': null });

        // Create draft PR
        const prBody = buildPrBody(description, issueId);

        const { data: pr } = await octokit.rest.pulls.create({
            owner: config.owner,
            repo: config.repo,
            title: prTitle,
            head: branchName,
            base: baseBranch,
            body: prBody,
            draft: true,
        });

        return {
            branch: branchName,
            pr: {
                body: pr.body,
                html_url: pr.html_url,
                id: pr.id,
                number: pr.number,
                title: pr.title,
            },
        };
    } catch (error) {
        throw new Error(`Failed to create branch and PR: ${(error as Error).message}`);
    }
}

function buildPrBody(description: string, issueId: string): string {
    const lines = [`## Linear Task: ${issueId}`, ''];

    if (description) {
        lines.push('## Description');
        lines.push('');
        lines.push(description);
        lines.push('');
    }

    lines.push('## Checklist');
    lines.push('');
    lines.push('- [ ] Code changes implemented');
    lines.push('- [ ] Tests added/updated');
    lines.push('- [ ] Documentation updated');
    lines.push('- [ ] Ready for review');

    return lines.join('\n');
}
