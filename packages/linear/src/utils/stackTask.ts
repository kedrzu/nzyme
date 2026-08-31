import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { GithubConfig } from '@nzyme/github-cli/GithubConfig.js';
import {
    buildNodeBranchName,
    extractNodeIndex,
    stripNodeSuffix,
} from '@nzyme/github-cli/utils/branchVersionHelpers.js';
import { checkUnpushedCommits } from '@nzyme/github-cli/utils/checkUnpushedCommits.js';
import { createBranchAndPr } from '@nzyme/github-cli/utils/createBranchAndPr.js';
import type { GithubClient } from '@nzyme/github-cli/utils/createGithubClient.js';
import { findTaskPrs } from '@nzyme/github-cli/utils/findMatchingPr.js';
import { getCurrentBranch } from '@nzyme/github-cli/utils/getCurrentBranch.js';
import { getGitStatusInfo } from '@nzyme/github-cli/utils/getGitStatusInfo.js';
import { addPrsToStack, createStack, findStackForPr } from '@nzyme/github-cli/utils/stacksApi.js';
import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Parameters for {@link stackTask}.
 */
export interface StackTaskParams {
    /**
     * The Linear issue ID (e.g. "SIG-123") the whole stack belongs to.
     */
    issueId: string;

    /**
     * Title describing what this node contains, used in the pull request title.
     */
    nodeTitle: string;

    /**
     * Linear client instance.
     */
    linearClient: LinearClient;

    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Add a node on top of the current one, turning the task's pull request into a stack.
 *
 * The stack itself is created lazily, on the first extra node: a task that never calls this keeps a
 * single ordinary pull request based on the trunk, with no stack attached to it. That is what makes
 * the split a decision you take when you reach the seam, rather than one you have to take up front
 * when you start the task and cannot yet know whether the work divides.
 *
 * The task keeps ONE Linear issue. Linear links every pull request whose branch carries the issue
 * ID, and holds the issue open until all of them have merged, so nodes need no sub-issues.
 */
export async function stackTask(params: StackTaskParams): Promise<void> {
    const { issueId, nodeTitle, linearClient, githubClient, githubConfig, logger } = params;

    const currentBranch = await getCurrentBranch();

    // The new node forks from the pushed tip of the current one, so anything still sitting in the
    // working tree would silently be left out of the node it belongs to. Refuse instead of guessing.
    const [statusInfo, unpushed] = await Promise.all([getGitStatusInfo(), checkUnpushedCommits()]);

    if (statusInfo.hasUncommittedChanges || unpushed.hasUnpushedCommits) {
        throw new UsageError(
            `Branch ${chalk.cyan(currentBranch)} has ${
                statusInfo.hasUncommittedChanges ? 'uncommitted changes' : 'unpushed commits'
            }. Run ${chalk.cyan('task push')} first so the new node forks from a complete parent.`,
        );
    }

    const issueData = await linearClient.issue(issueId);
    if (!issueData) {
        throw new UsageError(`Linear task ${chalk.bold(issueId)} not found`);
    }

    const existingPrs = await findTaskPrs(githubClient, githubConfig, issueId);
    if (existingPrs.length === 0) {
        throw new UsageError(
            `Task ${chalk.bold(issueId)} has no open pull request yet. ` +
                `Run ${chalk.cyan(`task ${issueId}`)} to create the first one before stacking on top of it.`,
        );
    }

    const parentPr = existingPrs.find(pr => pr.head.ref === currentBranch);
    if (!parentPr) {
        const nodes = existingPrs.map(pr => `  #${pr.number} ${pr.head.ref}`).join('\n');
        throw new UsageError(
            `Branch ${chalk.cyan(currentBranch)} is not one of ${chalk.bold(issueId)}'s pull requests:\n${nodes}\n` +
                'Check out the node you want to stack on top of first.',
        );
    }

    // Nodes are appended to the top of the stack, so the next index follows the highest one in use
    // rather than the position of the branch we happen to stand on.
    const highestNodeIndex = Math.max(...existingPrs.map(pr => extractNodeIndex(pr.head.ref)));
    const nextNodeIndex = highestNodeIndex + 1;
    const branchName = buildNodeBranchName(stripNodeSuffix(currentBranch), nextNodeIndex);

    const project = await issueData.project;
    const projectName = project?.name || '';
    const prTitle = projectName
        ? `[${issueId}][${projectName}] ${issueData.title} — ${nodeTitle}`
        : `[${issueId}] ${issueData.title} — ${nodeTitle}`;

    logger.info(`🧱 Stacking node ${chalk.bold(nextNodeIndex.toString())} on top of ${chalk.cyan(currentBranch)}`);
    logger.info(`🌿 Creating branch: ${chalk.cyan(branchName)}`);

    const result = await createBranchAndPr({
        client: githubClient,
        config: githubConfig,
        branchName,
        prTitle,
        description: issueData.description || '',
        issueId,
        taskUrl: issueData.url,
        issueTitle: issueData.title,
        baseBranch: currentBranch,
        startPoint: currentBranch,
    });

    logger.info(`✅ Created draft PR: ${chalk.blue(result.pr.title)} (#${result.pr.number})`);
    logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(result.pr.html_url))}`);

    const stack = await findStackForPr(githubClient, githubConfig, parentPr.number);

    if (stack) {
        const updated = await addPrsToStack(githubClient, githubConfig, stack.number, [result.pr.number]);
        logger.info(`🧱 Added to stack #${chalk.bold(stack.number.toString())} (${updated.pullRequests.length} PRs)`);
    } else {
        // First extra node: the existing pull requests plus this one become a stack, ordered bottom
        // to top. Anything already open for the task is folded in so a task that grew a second PR
        // by other means still ends up with one coherent stack.
        const ordered = [...existingPrs.map(pr => pr.number), result.pr.number];
        const created = await createStack(githubClient, githubConfig, ordered);
        logger.info(`🧱 Created stack #${chalk.bold(created.number.toString())} (${ordered.length} PRs)`);
    }

    logger.info(`🔗 Linear task: ${chalk.underline(issueData.url)}`);
    logger.info(
        `🎉 On node ${chalk.bold(nextNodeIndex.toString())} of ${chalk.bold(issueId)} — ${chalk.cyan(branchName)}`,
    );
}
