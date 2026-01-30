import chalk from 'chalk';
import open from 'open';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import {
    commitAndPushPendingChanges,
    convertAllPrsToReady,
    createGithubClient,
    findMatchingPr,
    getCurrentBranch,
    handlePushPreparation,
    openPrInBrowser,
    pushSubmoduleUpdates,
    refreshSubmodules,
    syncBaseBranch,
} from '@nzyme/github-cli';
import type { GithubConfig } from '@nzyme/github-cli';

import { createSentryClient } from '../utils/createSentryClient.js';
import { extractIssueIdFromBranch } from '../utils/extractIssueIdFromBranch.js';
import { getSentryIssue } from '../utils/getSentryIssue.js';
import { parseIssueIdentifier } from '../utils/parseIssueIdentifier.js';
import { switchToSentryIssue } from '../utils/switchToSentryIssue.js';

/**
 * Configuration for Sentry API access.
 */
export interface SentryConfig {
    /**
     * Sentry API token.
     */
    apiToken: string;

    /**
     * Sentry organization slug.
     */
    organizationSlug: string;

    /**
     * Sentry API base URL (optional, defaults to https://sentry.io/api/0).
     */
    apiUrl?: string;

    /**
     * Default project prefix for issue IDs (e.g., 'MYPROJECT' for MYPROJECT-123).
     */
    defaultPrefix?: string;

    /**
     * Default branch prefix for issue IDs.
     * @default 'bug'
     */
    branchPrefix?: string;
}

/**
 * Options for the Sentry commands.
 */
export interface SentryCommandsOptions {
    /**
     * Sentry configuration.
     */
    sentry: (() => Promise<SentryConfig>) | (() => SentryConfig) | SentryConfig;

    /**
     * GitHub configuration.
     */
    github: (() => GithubConfig) | (() => Promise<GithubConfig>) | GithubConfig;

    /**
     * The prefix to use for commands.
     */
    prefix?: string;

    /**
     * The function to call before each command.
     */
    beforeEach?: () => Promise<void>;

    /**
     * The base branch(es) to use when creating new branches.
     * Can be a string (e.g., 'main'), an array of strings (e.g., ['main', 'develop']),
     * or a function that returns the base branch name(s).
     * If not provided, defaults to the current branch.
     */
    baseBranch?:
        | (() => Promise<string>)
        | (() => Promise<string[]>)
        | (() => string)
        | (() => string[])
        | string
        | string[];
}

/**
 * Define the Sentry commands.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSentryCommands(options: SentryCommandsOptions): CommandClass[] {
    return [
        //
        defineIssueInfoCommand(options),
        defineIssueStartCommand(options),
        defineIssuePushCommand(options),
        defineIssueReadyCommand(options),
        defineIssueRefreshCommand(options),
        defineIssueOpenCommand(options),
        defineIssuePrCommand(options),
    ];
}

function defineIssueInfoCommand(options: SentryCommandsOptions) {
    return class IssueInfoCommand extends Command {
        static override paths = getCommandPaths(options);
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Display information about the current Sentry issue',
            details:
                'Detects the issue from the current branch and displays comprehensive information including issue details, URLs, and associated PR',
            examples: [['Show current issue information', 'issue info']],
        });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [sentryConfig, githubConfig] = await Promise.all([
                getSentryConfig(options),
                getGithubConfig(options),
            ]);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract issue ID from branch name
                const issueId = extractIssueIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found issue ID: ${chalk.bold(issueId)}`);

                // Create clients in parallel
                const [sentryClient, githubClient] = await Promise.all([
                    Promise.resolve(createSentryClient(sentryConfig)),
                    Promise.resolve(createGithubClient(githubConfig)),
                ]);

                // Get issue details and search for PR in parallel
                this.logger.info('🔍 Fetching issue details and searching for associated PR...');
                const [issueData, pr] = await Promise.all([
                    getSentryIssue(sentryClient, sentryConfig.organizationSlug, issueId),
                    findMatchingPr(githubClient, githubConfig, issueId),
                ]);

                if (!issueData) {
                    throw new UsageError(`Sentry issue ${issueId} not found`);
                }

                // Display issue information
                this.logger.info('');
                this.logger.info(chalk.bold.blue('🐛 Sentry Issue Information'));
                this.logger.info('═'.repeat(50));
                this.logger.info(`📝 Issue Title: ${chalk.green(issueData.title)}`);
                this.logger.info(`🔗 Issue URL: ${chalk.underline(issueData.permalink)}`);
                this.logger.info(`🏷️  Issue Type: ${chalk.yellow(issueData.type)}`);
                this.logger.info(`📊 Level: ${chalk.red(issueData.level)}`);
                this.logger.info(`🔢 Count: ${chalk.magenta(issueData.count)}`);
                this.logger.info(`🏗️  Project: ${chalk.blue(issueData.project.name)}`);
                this.logger.info(`🌿 Branch Name: ${chalk.cyan(currentBranch)}`);

                if (pr) {
                    this.logger.info(`📎 PR URL: ${chalk.blueBright(chalk.underline(pr.html_url))}`);
                    this.logger.info(
                        `📊 PR Status: ${pr.draft ? chalk.yellow('Draft') : chalk.green('Ready for review')}`,
                    );
                } else {
                    this.logger.info(`📎 PR URL: ${chalk.gray('No PR found for this issue')}`);
                }

                this.logger.info('');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to get issue info: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineIssueStartCommand(options: SentryCommandsOptions) {
    return class IssueStartCommand extends Command {
        static override paths = getCommandPaths(options);
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Start working on a Sentry issue',
            details: 'Find or create a GitHub PR for a Sentry issue and checkout the branch',
            examples: [
                ['Start work on issue by ID', 'issue MYPROJECT-123'],
                ['Start work on issue by number', 'issue 123'],
                ['Start work on issue by URL', 'issue https://sentry.io/organizations/myorg/issues/12345/'],
            ],
        });

        issueIdentifier = Option.String({ required: true });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [sentryConfig, githubConfig] = await Promise.all([
                getSentryConfig(options),
                getGithubConfig(options),
            ]);

            try {
                // Parse issue identifier to get the issue ID
                const issueId = parseIssueIdentifier(this.issueIdentifier, sentryConfig.defaultPrefix);

                // Create GitHub client and get base branches
                const [sentryClient, githubClient, baseBranches] = await Promise.all([
                    Promise.resolve(createSentryClient(sentryConfig)),
                    Promise.resolve(createGithubClient(githubConfig)),
                    getBaseBranches(options),
                ]);

                // Use the common switch to issue utility
                await switchToSentryIssue({
                    issueId,
                    organizationSlug: sentryConfig.organizationSlug,
                    sentryClient,
                    githubClient,
                    githubConfig,
                    logger: this.logger,
                    baseBranches,
                    branchPrefix: sentryConfig.branchPrefix,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to start work on issue ${this.issueIdentifier}: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineIssuePushCommand(options: SentryCommandsOptions) {
    return class IssuePushCommand extends Command {
        static override paths = getCommandPaths(options, 'push');
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Push changes and handle submodules without marking PR as ready',
            details:
                'Commits and pushes changes in both submodules and main repository. Useful when you want to push work in progress without marking the PR as ready for review.',
            examples: [
                ['Push current issue changes', 'issue push'],
                ['Push without processing submodules', 'issue push --skip-submodules'],
                ['Push with auto-commit (skip prompts)', 'issue push --yes'],
            ],
        });

        skipSubmodules = Option.Boolean('--skip-submodules', false, {
            description: 'Skip processing submodules',
        });

        yes = Option.Boolean('--yes,-y', false, {
            description: 'Skip prompts and automatically commit with default message',
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGithubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract issue ID from branch name
                const issueId = extractIssueIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found issue ID: ${chalk.bold(issueId)}`);

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Check if PR exists and is in review
                const pr = await findMatchingPr(githubClient, githubConfig, issueId);
                const prInReview = pr ? !pr.draft : false;

                // Get base branches
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches.length > 0 ? baseBranches[0]! : 'main';

                // Handle preparation (submodules and main repo)
                await handlePushPreparation({
                    githubClient,
                    githubConfig,
                    issueId,
                    logger: this.logger,
                    baseBranch,
                    skipSubmodules: this.skipSubmodules,
                    autoYes: this.yes,
                    prInReview,
                });

                this.logger.info('');
                this.logger.info(`🎉 Successfully pushed all changes for issue ${chalk.bold(issueId)}!`);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to push issue changes: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineIssueReadyCommand(options: SentryCommandsOptions) {
    return class IssueReadyCommand extends Command {
        static override paths = getCommandPaths(options, 'ready');
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Convert current issue from draft to ready for review',
            details:
                'Detects the issue from the current branch and converts the associated PR from draft to ready for review',
            examples: [
                ['Convert current issue to ready for review', 'issue ready'],
                ['Convert to ready without processing submodules', 'issue ready --skip-submodules'],
                ['Convert to ready with auto-commit (skip prompts)', 'issue ready --yes'],
            ],
        });

        skipSubmodules = Option.Boolean('--skip-submodules', false, {
            description: 'Skip processing submodules',
        });

        yes = Option.Boolean('--yes,-y', false, {
            description: 'Skip prompts and automatically commit with default message',
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGithubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract issue ID from branch name
                const issueId = extractIssueIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found issue ID: ${chalk.bold(issueId)}`);

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Find the PR for this issue
                this.logger.info('🔍 Looking for associated GitHub PR...');
                const pr = await findMatchingPr(githubClient, githubConfig, issueId);

                if (!pr) {
                    throw new UsageError(
                        `No GitHub PR found for issue ${issueId}. ` +
                            'Make sure you have created a PR for this issue first using "issue ' +
                            issueId +
                            '".',
                    );
                }

                this.logger.info(`✅ Found PR: ${chalk.blue(pr.title)} (#${pr.number})`);

                // Check if PR is already in review
                const prInReview = !pr.draft;

                // Handle preparation (submodules and main repo)
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches.length > 0 ? baseBranches[0]! : pr.base.ref;

                await handlePushPreparation({
                    githubClient,
                    githubConfig,
                    issueId,
                    logger: this.logger,
                    baseBranch,
                    skipSubmodules: this.skipSubmodules,
                    autoYes: this.yes,
                    prInReview,
                    defaultCommitMessage: 'Ready for review',
                });

                // Convert all PRs (main and submodules) to ready
                await convertAllPrsToReady({
                    githubClient,
                    githubConfig,
                    issueId,
                    logger: this.logger,
                    mainPrNumber: pr.number,
                    mainPrIsDraft: pr.draft,
                    mainPrUrl: pr.html_url,
                    skipSubmodules: this.skipSubmodules,
                });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to push issue to review: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineIssueRefreshCommand(options: SentryCommandsOptions) {
    return class IssueRefreshCommand extends Command {
        static override paths = getCommandPaths(options, 'refresh');
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Refresh current issue branch with latest base branch changes',
            details:
                'Fetches the base branch, fast-forwards it, and merges it into the current issue branch and all submodules. Pushes submodule changes and commits submodule reference updates.',
            examples: [
                ['Refresh current issue with base branch', 'issue refresh'],
                ['Refresh with auto-commit (skip prompts)', 'issue refresh --yes'],
            ],
        });

        yes = Option.Boolean('--yes,-y', false, {
            description: 'Skip prompts and automatically commit pending changes with default message',
        });

        override async run() {
            await options.beforeEach?.();

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract issue ID from branch name
                const issueId = extractIssueIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found issue ID: ${chalk.bold(issueId)}`);

                // Get base branches
                const baseBranches = await getBaseBranches(options);
                if (baseBranches.length === 0) {
                    throw new UsageError('No base branches configured');
                }

                // For refresh, use the first base branch as default (backward compatibility)
                const baseBranch = baseBranches[0]!;
                this.logger.info(
                    `🔄 Refreshing issue ${chalk.bold(issueId)} with base branch ${chalk.cyan(baseBranch)}`,
                );

                // 1. Refresh submodules first (includes checking for pending changes)
                this.logger.info('');
                this.logger.info(chalk.bold('📦 Refreshing submodules...'));
                await refreshSubmodules({ baseBranch, logger: this.logger, autoYes: this.yes });

                // 2. Check for pending changes in main repo and commit/push before merge
                this.logger.info('');
                this.logger.info(chalk.bold('🔄 Refreshing main repository...'));
                await commitAndPushPendingChanges({
                    logger: this.logger,
                    repoDisplayName: 'main repository',
                    autoYes: this.yes,
                    defaultCommitMessage: 'Work in progress',
                });

                // 3. Sync with base branch
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
                    this.logger.info(`✅ Issue branch is already up to date with ${chalk.cyan(baseBranch)}`);
                }

                // 4. Commit and push submodule reference changes
                this.logger.info('');
                await pushSubmoduleUpdates({ logger: this.logger });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to refresh issue: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineIssueOpenCommand(options: SentryCommandsOptions) {
    return class IssueOpenCommand extends Command {
        static override paths = getCommandPaths(options, 'open');
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Open the current Sentry issue in the browser',
            details: 'Detects the issue from the current branch and opens the Sentry issue URL in your default browser',
            examples: [['Open current issue in browser', 'issue open']],
        });

        override async run() {
            await options.beforeEach?.();

            const sentryConfig = await getSentryConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract issue ID from branch name
                const issueId = extractIssueIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found issue ID: ${chalk.bold(issueId)}`);

                // Create Sentry client
                const sentryClient = createSentryClient(sentryConfig);

                // Get issue details
                this.logger.info('🔍 Fetching issue details...');
                const issueData = await getSentryIssue(sentryClient, sentryConfig.organizationSlug, issueId);

                if (!issueData) {
                    throw new UsageError(`Sentry issue ${issueId} not found`);
                }

                this.logger.info(`🚀 Opening issue ${chalk.bold(issueId)} in browser...`);
                this.logger.info(`🔗 URL: ${chalk.underline(issueData.permalink)}`);

                await open(issueData.permalink);

                this.logger.info(`✅ Issue opened successfully!`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to open issue: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineIssuePrCommand(options: SentryCommandsOptions) {
    return class IssuePrCommand extends Command {
        static override paths = getCommandPaths(options, 'pr');
        static override usage = Command.Usage({
            category: 'Sentry',
            description: 'Open the current issue PR in the browser',
            details:
                'Detects the issue from the current branch, finds the associated GitHub PR, and opens it in your default browser. If multiple PRs exist (main repo + submodules), lets you choose which one to open.',
            examples: [['Open current issue PR in browser', 'issue pr']],
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGithubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract issue ID from branch name
                const issueId = extractIssueIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found issue ID: ${chalk.bold(issueId)}`);

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Find, select, and open PR in browser
                this.logger.info('🔍 Looking for associated GitHub PRs...');
                await openPrInBrowser({
                    githubClient,
                    githubConfig,
                    issueId,
                    logger: this.logger,
                });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to open PR: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function getCommandPaths(options: SentryCommandsOptions, ...commands: string[]) {
    if (options.prefix) {
        return [[options.prefix, ...commands]];
    }

    return [[...commands]];
}

async function getSentryConfig(options: SentryCommandsOptions): Promise<SentryConfig> {
    if (typeof options.sentry === 'function') {
        return await options.sentry();
    }

    return options.sentry;
}

async function getGithubConfig(options: SentryCommandsOptions): Promise<GithubConfig> {
    if (typeof options.github === 'function') {
        return await options.github();
    }

    return options.github;
}

async function getBaseBranches(options: SentryCommandsOptions): Promise<string[]> {
    if (typeof options.baseBranch === 'function') {
        const result = await options.baseBranch();
        return Array.isArray(result) ? result : [result];
    }

    if (Array.isArray(options.baseBranch)) {
        return options.baseBranch;
    }

    return options.baseBranch ? [options.baseBranch] : [];
}
