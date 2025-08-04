import chalk from 'chalk';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';

import { checkoutBranch } from '../utils/checkoutBranch.js';
import { checkUncommittedChanges } from '../utils/checkUncommittedChanges.js';
import { convertPrToReady } from '../utils/convertPrToReady.js';
import { createBranchAndPr } from '../utils/createBranchAndPr.js';
import { createLinearClient } from '../utils/createLinearClient.js';
import { createOctokitClient } from '../utils/createOctokitClient.js';
import { extractTaskIdFromBranch } from '../utils/extractTaskIdFromBranch.js';
import { findMatchingPr } from '../utils/findMatchingPr.js';
import { getCurrentBranch } from '../utils/getCurrentBranch.js';
import { parseTaskIdentifier } from '../utils/parseTaskIdentifier.js';

/**
 * Configuration for Linear API access.
 */
export interface LinearConfig {
    /**
     * Linear API token.
     */
    apiToken: string;

    /**
     * Default team prefix (e.g., 'SIG' for SIG-123).
     */
    defaultPrefix?: string;
}

/**
 * Configuration for GitHub API access.
 */
export interface GitHubConfig {
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

/**
 * Options for the Linear commands.
 */
export interface LinearCommandsOptions {
    /**
     * Linear configuration.
     */
    linear: (() => LinearConfig) | (() => Promise<LinearConfig>) | LinearConfig;

    /**
     * GitHub configuration.
     */
    github: (() => GitHubConfig) | (() => Promise<GitHubConfig>) | GitHubConfig;

    /**
     * The prefix to use for commands.
     */
    prefix?: string;

    /**
     * The function to call before each command.
     */
    beforeEach?: () => Promise<void>;
}

/**
 * Define the Linear commands.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearCommands(options: LinearCommandsOptions): CommandClass[] {
    return [defineTaskCommand(options), definePushCommand(options)];
}

function defineTaskCommand(options: LinearCommandsOptions) {
    return class TaskCommand extends Command {
        static override paths = getCommandPaths(options, 'task');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Start working on a Linear task',
            details: 'Find or create a GitHub PR for a Linear task and checkout the branch',
            examples: [
                ['Start work on task by ID', 'task SIG-123'],
                ['Start work on task by ID without prefix', 'task 123'],
                ['Start work on task by URL', 'task https://linear.app/sig/issue/SIG-123/some-task'],
            ],
        });

        taskIdentifier = Option.String({ required: true });

        override async run() {
            await options.beforeEach?.();

            const linearConfig = await getLinearConfig(options);
            const githubConfig = await getGitHubConfig(options);

            try {
                // Parse task identifier to get the issue ID
                const issueId = parseTaskIdentifier(this.taskIdentifier, linearConfig.defaultPrefix);
                this.logger.info(`🔍 Looking for Linear task: ${chalk.bold(issueId)}`);

                // Get Linear issue details
                const linearClient = createLinearClient(linearConfig);
                const issueData = await linearClient.issue(issueId);

                if (!issueData) {
                    throw new UsageError(`Linear task ${issueId} not found`);
                }

                this.logger.info(`📝 Found task: ${chalk.green(issueData.title)}`);

                // Create GitHub client
                const octokit = createOctokitClient(githubConfig);

                // Look for existing PR
                this.logger.info(`🔍 Searching for existing GitHub PR...`);
                const existingPr = await findMatchingPr(octokit, githubConfig, issueId);

                if (existingPr) {
                    // Checkout existing PR branch
                    this.logger.info(`✅ Found existing PR: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
                    this.logger.info(`🔄 Checking out branch: ${chalk.cyan(existingPr.head.ref)}`);

                    await checkoutBranch(existingPr.head.ref);

                    this.logger.info(`🎉 Successfully checked out existing branch for ${chalk.bold(issueId)}`);
                } else {
                    // Create new branch and PR
                    this.logger.info(`📝 No existing PR found. Creating new branch and draft PR...`);

                    const branchName =
                        issueData.branchName ||
                        `${issueId.toLowerCase()}-${issueData.title
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '-')
                            .replace(/-+/g, '-')
                            .slice(0, 50)}`;
                    const prTitle = `[${issueId}] ${issueData.title}`;

                    this.logger.info(`🌿 Creating branch: ${chalk.cyan(branchName)}`);

                    const result = await createBranchAndPr(
                        octokit,
                        githubConfig,
                        branchName,
                        prTitle,
                        issueData.description || '',
                        issueId,
                    );

                    this.logger.info(`✅ Created draft PR: ${chalk.blue(result.pr.title)} (#${result.pr.number})`);
                    this.logger.info(`🎉 Successfully created and checked out new branch for ${chalk.bold(issueId)}`);
                }

                // Show task URL for reference
                this.logger.info(`🔗 Linear task: ${chalk.underline(issueData.url)}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to start work on task ${this.taskIdentifier}: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function definePushCommand(options: LinearCommandsOptions) {
    return class PushCommand extends Command {
        static override paths = getCommandPaths(options, 'push');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Convert current task from draft to ready for review',
            details:
                'Detects the task from the current branch and converts the associated PR from draft to ready for review',
            examples: [['Convert current task to ready for review', 'task push']],
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGitHubConfig(options);

            try {
                // Check for uncommitted changes first
                this.logger.info('🔍 Checking for uncommitted changes...');
                await checkUncommittedChanges();

                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create GitHub client
                const octokit = createOctokitClient(githubConfig);

                // Find the PR for this task
                this.logger.info('🔍 Looking for associated GitHub PR...');
                const pr = await findMatchingPr(octokit, githubConfig, taskId);

                if (!pr) {
                    throw new UsageError(
                        `No GitHub PR found for task ${taskId}. ` +
                            'Make sure you have created a PR for this task first using "task ' +
                            taskId +
                            '".',
                    );
                }

                this.logger.info(`✅ Found PR: ${chalk.blue(pr.title)} (#${pr.number})`);

                if (!pr.draft) {
                    this.logger.info(`🎉 PR #${pr.number} is already ready for review!`);
                    this.logger.info(`🔗 PR URL: ${chalk.underline(pr.html_url)}`);
                    return;
                }

                // Convert PR from draft to ready
                this.logger.info('🚀 Converting PR from draft to ready for review...');
                await convertPrToReady(octokit, githubConfig, pr.number);

                this.logger.info(`🎉 Successfully converted PR #${pr.number} to ready for review!`);
                this.logger.info(`🔗 PR URL: ${chalk.underline(pr.html_url)}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to push task to review: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function getCommandPaths(options: LinearCommandsOptions, command: string) {
    if (options.prefix) {
        return [[options.prefix, command]];
    }

    return [[command]];
}

async function getLinearConfig(options: LinearCommandsOptions): Promise<LinearConfig> {
    if (typeof options.linear === 'function') {
        return await options.linear();
    }

    return options.linear;
}

async function getGitHubConfig(options: LinearCommandsOptions): Promise<GitHubConfig> {
    if (typeof options.github === 'function') {
        return await options.github();
    }

    return options.github;
}
