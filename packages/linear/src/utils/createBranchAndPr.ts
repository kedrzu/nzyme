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
    baseBranch?: string,
): Promise<CreateBranchAndPrResult> {
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
            await git.commit('Initial commit', [], { '--allow-empty': null });
        }

        // Push the new branch to origin
        await git.push('origin', branchName, { '--set-upstream': null });

        // Create draft PR
        const prBody = buildPrBody(description, issueId);

        const { data: pr } = await octokit.rest.pulls.create({
            owner: config.owner,
            repo: config.repo,
            title: prTitle,
            head: branchName,
            base: resolvedBaseBranch,
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
