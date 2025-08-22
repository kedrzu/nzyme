import chalk from 'chalk';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';

import { checkoutExistingBranch } from '../utils/checkoutExistingBranch.js';
import { checkUnpushedCommits } from '../utils/checkUnpushedCommits.js';
import { convertPrToReady } from '../utils/convertPrToReady.js';
import { createBranchAndPr } from '../utils/createBranchAndPr.js';
import { createLinearClient } from '../utils/createLinearClient.js';
import { createOctokitClient } from '../utils/createOctokitClient.js';
import { extractTaskIdFromBranch } from '../utils/extractTaskIdFromBranch.js';
import { findMatchingPr } from '../utils/findMatchingPr.js';
import { getCurrentBranch } from '../utils/getCurrentBranch.js';
import { getGitStatusInfo } from '../utils/getGitStatusInfo.js';
import { applyStashedChanges, handleBranchSelection } from '../utils/handleBranchSelection.js';
import { handleReadyPreparation } from '../utils/handleReadyPreparation.js';
import { handleTaskAssignment } from '../utils/handleTaskAssignment.js';
import { parseTaskIdentifier } from '../utils/parseTaskIdentifier.js';
import { syncBaseBranch } from '../utils/syncBaseBranch.js';

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

    /**
     * The base branch to use when creating new branches.
     * Can be a string (e.g., 'main', 'develop') or a function that returns the base branch name.
     * If not provided, defaults to the current branch.
     */
    baseBranch?: (() => Promise<string>) | (() => string) | string;
}

/**
 * Define the Linear commands.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearCommands(options: LinearCommandsOptions): CommandClass[] {
    return [
        //
        defineTaskInfoCommand(options),
        defineTaskStartCommand(options),
        defineTaskReadyCommand(options),
        defineTaskRefreshCommand(options),
    ];
}

function defineTaskInfoCommand(options: LinearCommandsOptions) {
    return class TaskInfoCommand extends Command {
        static override paths = getCommandPaths(options, 'task');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Display information about the current task',
            details:
                'Detects the task from the current branch and displays comprehensive information including task name, URLs, and associated PR',
            examples: [['Show current task information', 'task info']],
        });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGitHubConfig(options),
            ]);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create clients in parallel
                const [linearClient, octokit] = await Promise.all([
                    Promise.resolve(createLinearClient(linearConfig)),
                    Promise.resolve(createOctokitClient(githubConfig)),
                ]);

                // Get task details and search for PR in parallel
                this.logger.info('🔍 Fetching task details and searching for associated PR...');
                const [issueData, pr] = await Promise.all([
                    linearClient.issue(taskId),
                    findMatchingPr(octokit, githubConfig, taskId),
                ]);

                if (!issueData) {
                    throw new UsageError(`Linear task ${taskId} not found`);
                }

                // Display task information
                this.logger.info('');
                this.logger.info(chalk.bold.blue('📋 Task Information'));
                this.logger.info('═'.repeat(50));
                this.logger.info(`📝 Task Name: ${chalk.green(issueData.title)}`);
                this.logger.info(`🔗 Task URL: ${chalk.underline(issueData.url)}`);
                this.logger.info(`🌿 Branch Name: ${chalk.cyan(currentBranch)}`);

                if (pr) {
                    this.logger.info(`📎 PR URL: ${chalk.underline(pr.html_url)}`);
                    this.logger.info(
                        `📊 PR Status: ${pr.draft ? chalk.yellow('Draft') : chalk.green('Ready for review')}`,
                    );
                } else {
                    this.logger.info(`📎 PR URL: ${chalk.gray('No PR found for this task')}`);
                }

                this.logger.info('');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to get task info: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskStartCommand(options: LinearCommandsOptions) {
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

            // Load both configs in parallel
            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGitHubConfig(options),
            ]);

            try {
                // Parse task identifier to get the issue ID
                const issueId = parseTaskIdentifier(this.taskIdentifier, linearConfig.defaultPrefix);
                this.logger.info(`🔍 Looking for Linear task: ${chalk.bold(issueId)}`);

                // Get Linear issue details with team information
                const linearClient = createLinearClient(linearConfig);
                const issueData = await linearClient.issue(issueId);

                if (!issueData) {
                    throw new UsageError(`Linear task ${issueId} not found`);
                }

                this.logger.info(`📝 Found task: ${chalk.green(issueData.title)}`);

                // Create GitHub client
                const octokit = createOctokitClient(githubConfig);

                // Handle task assignment and search for existing PR in parallel
                this.logger.info(`🔍 Searching for existing GitHub PR...`);
                const [, existingPr] = await Promise.all([
                    handleTaskAssignment(linearClient, issueData, this.logger),
                    findMatchingPr(octokit, githubConfig, issueId),
                ]);

                if (existingPr) {
                    // Checkout existing PR branch
                    this.logger.info(`✅ Found existing PR: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
                    this.logger.info(`🔄 Checking out branch: ${chalk.cyan(existingPr.head.ref)}`);

                    await checkoutExistingBranch(existingPr.head.ref, issueId, this.logger);

                    // Sync with base branch after checkout
                    const baseBranch = await getBaseBranch(options);
                    if (baseBranch) {
                        this.logger.info(`🔄 Synchronizing with base branch ${chalk.cyan(baseBranch)}`);
                        await syncBaseBranch(baseBranch, this.logger);
                    }

                    this.logger.info(`🎉 Successfully checked out existing branch for ${chalk.bold(issueId)}`);
                } else {
                    // Create new branch and PR
                    this.logger.info(`📝 No existing PR found. Creating new branch and draft PR...`);

                    // Get current branch and base branch in parallel
                    const [currentBranch, baseBranch] = await Promise.all([getCurrentBranch(), getBaseBranch(options)]);

                    if (!baseBranch) {
                        throw new UsageError('Base branch is not configured');
                    }

                    // Handle branch selection and stashing if needed
                    const branchResult = await handleBranchSelection(currentBranch, baseBranch, issueId, this.logger);

                    const branchName =
                        issueData.branchName ||
                        `${issueId.toLowerCase()}-${issueData.title
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '-')
                            .replace(/-+/g, '-')
                            .slice(0, 50)}`;

                    // Get project information for PR title
                    const project = await issueData.project;
                    const projectName = project?.name || '';
                    const prTitle = projectName
                        ? `[${issueId}][${projectName}] ${issueData.title}`
                        : `[${issueId}] ${issueData.title}`;

                    this.logger.info(`🌿 Creating branch: ${chalk.cyan(branchName)}`);

                    const selectedBaseBranch = branchResult.useBaseBranch ? baseBranch : currentBranch;

                    const result = await createBranchAndPr(
                        octokit,
                        githubConfig,
                        branchName,
                        prTitle,
                        issueData.description || '',
                        issueId,
                        issueData.url,
                        issueData.title,
                        selectedBaseBranch,
                    );

                    // Apply stashed changes if any
                    if (branchResult.stashName) {
                        await applyStashedChanges(branchResult.stashName, this.logger);
                    }

                    this.logger.info(`✅ Created draft PR: ${chalk.blue(result.pr.title)} (#${result.pr.number})`);
                    this.logger.info(`🔗 PR URL: ${chalk.underline(result.pr.html_url)}`);
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

function defineTaskReadyCommand(options: LinearCommandsOptions) {
    return class ReadyCommand extends Command {
        static override paths = getCommandPaths(options, 'task', 'ready');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Convert current task from draft to ready for review',
            details:
                'Detects the task from the current branch and converts the associated PR from draft to ready for review',
            examples: [['Convert current task to ready for review', 'task ready']],
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGitHubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Check for unpushed commits and uncommitted changes in parallel
                this.logger.info('🔍 Checking repository status...');
                const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(), getGitStatusInfo()]);

                // Handle preparation (push commits, commit changes) with user interaction
                await handleReadyPreparation(unpushedCommits, statusInfo, this.logger);

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

function defineTaskRefreshCommand(options: LinearCommandsOptions) {
    return class TaskRefreshCommand extends Command {
        static override paths = getCommandPaths(options, 'task', 'refresh');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Refresh current task branch with latest base branch changes',
            details:
                'Fetches the base branch, fast-forwards it, and optionally merges it into the current task branch if it is ahead',
            examples: [['Refresh current task with base branch', 'task refresh']],
        });

        override async run() {
            await options.beforeEach?.();

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Get base branch
                const baseBranch = await getBaseBranch(options);
                if (!baseBranch) {
                    throw new UsageError('Base branch is not configured');
                }

                this.logger.info(`🔄 Refreshing task ${chalk.bold(taskId)} with base branch ${chalk.cyan(baseBranch)}`);

                // Sync with base branch - automatically merge without prompting
                const result = await syncBaseBranch(baseBranch, this.logger, true);

                if (result.mergePerformed) {
                    this.logger.info(
                        `🎉 Successfully merged ${chalk.yellow(result.commitsAhead?.toString())} commit${
                            result.commitsAhead === 1 ? '' : 's'
                        } from ${chalk.cyan(baseBranch)}`,
                    );
                } else if (result.wasBaseBranchAhead) {
                    this.logger.info(`⏭️  Base branch changes available but not merged`);
                } else {
                    this.logger.info(`✅ Task branch is already up to date with ${chalk.cyan(baseBranch)}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to refresh task: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function getCommandPaths(options: LinearCommandsOptions, ...commands: string[]) {
    if (options.prefix) {
        return [[options.prefix, ...commands]];
    }

    return [[...commands]];
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

async function getBaseBranch(options: LinearCommandsOptions): Promise<string | undefined> {
    if (typeof options.baseBranch === 'function') {
        return await options.baseBranch();
    }

    return options.baseBranch;
}
