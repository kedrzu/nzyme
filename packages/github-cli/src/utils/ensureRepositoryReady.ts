import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import { createDraftPr } from './createDraftPr.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';

/**
 * Parameters for ensuring a repository is ready.
 */
export interface EnsureRepositoryReadyParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration (owner, repo, token).
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID for PR creation.
     */
    issueId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Base branch for PR creation.
     */
    baseBranch: string;

    /**
     * Optional SimpleGit instance (uses current directory if not provided).
     */
    git?: SimpleGit;

    /**
     * Optional repository display name (for logging, e.g., "submodule nzyme").
     */
    repoDisplayName?: string;

    /**
     * Optional PR title generator function.
     */
    generatePrTitle?: (issueId: string) => string;

    /**
     * Optional PR body generator function.
     */
    generatePrBody?: (issueId: string) => string;

    /**
     * Optional default commit message.
     */
    defaultCommitMessage?: string;

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;
}

/**
 * Ensure a repository is ready for review by:
 * 1. Committing any uncommitted changes (if user confirms)
 * 2. Pushing all commits
 * 3. Ensuring a PR exists (creates if missing)
 *
 * This function provides a unified flow for both main repositories and submodules.
 */
export async function ensureRepositoryReady(params: EnsureRepositoryReadyParams): Promise<void> {
    const {
        githubClient,
        githubConfig,
        issueId,
        logger,
        baseBranch,
        git = simpleGit(),
        repoDisplayName = 'repository',
        generatePrTitle = (id: string) => `[${id}] Changes`,
        generatePrBody = (id: string) => `# [${id}] Changes\n\nThis PR contains changes for task ${id}.`,
        defaultCommitMessage = 'Ready for review',
        autoYes = false,
    } = params;

    const prefix = repoDisplayName !== 'repository' ? `[${repoDisplayName}] ` : '';

    // Step 1: Check for uncommitted changes and unpushed commits
    logger.info(`${prefix}🔍 Checking ${repoDisplayName} status...`);
    const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(git), getGitStatusInfo(git)]);

    let newCommitCreated = false;

    // Step 2: Show unpushed commits if any
    if (unpushedCommits.hasUnpushedCommits) {
        logger.info(
            `${prefix}⚠️  You have ${chalk.yellow(unpushedCommits.commitsCount.toString())} unpushed commit${
                unpushedCommits.commitsCount === 1 ? '' : 's'
            }:`,
        );

        // Show the commit messages
        for (const message of unpushedCommits.commitMessages.slice(0, 5)) {
            logger.info(`   • ${chalk.gray(message)}`);
        }

        if (unpushedCommits.commitMessages.length > 5) {
            logger.info(`   ... and ${unpushedCommits.commitMessages.length - 5} more`);
        }
    }

    // Step 3: Handle uncommitted changes
    if (statusInfo.hasUncommittedChanges) {
        const hasStagedFiles = statusInfo.changes.staged > 0;
        const hasUnstagedFiles = statusInfo.totalChanges > statusInfo.changes.staged;

        logger.info(
            `${prefix}⚠️  You have ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
                statusInfo.totalChanges === 1 ? '' : 's'
            }: ${chalk.yellow(statusInfo.changeDescription)}`,
        );

        let shouldCommit: 'no' | 'yes' = 'yes';
        let commitMessage = defaultCommitMessage;

        if (!autoYes) {
            const response = await enquirer.prompt<{ shouldCommit: 'no' | 'yes' }>({
                type: 'select',
                name: 'shouldCommit',
                message: `Do you want to commit these ${statusInfo.totalChanges} change${
                    statusInfo.totalChanges === 1 ? '' : 's'
                } in ${repoDisplayName}?`,
                choices: [
                    {
                        name: 'yes',
                        message: `Yes, commit ${statusInfo.totalChanges} change${statusInfo.totalChanges === 1 ? '' : 's'}`,
                    },
                    {
                        name: 'no',
                        message: 'No, skip committing',
                    },
                ],
            });
            shouldCommit = response.shouldCommit;
        } else {
            logger.info(`${prefix}✅ Auto-committing changes (--yes flag)`);
        }

        if (shouldCommit === 'yes') {
            // Add unstaged changes to staging if there are any
            if (hasUnstagedFiles) {
                logger.info(`${prefix}📦 Adding all changes to staging...`);
                await git.add('.');
            } else if (hasStagedFiles) {
                logger.info(`${prefix}📦 Using already staged files...`);
            }

            // Prompt for commit message if not in auto-yes mode
            if (!autoYes) {
                const response = await enquirer.prompt<{ commitMessage: string }>({
                    type: 'input',
                    name: 'commitMessage',
                    message: `Enter commit message for ${repoDisplayName}:`,
                    initial: defaultCommitMessage,
                    validate: (input: string) => {
                        if (!input.trim()) {
                            return 'Commit message cannot be empty';
                        }
                        return true;
                    },
                });
                commitMessage = response.commitMessage;
            }

            // Commit the changes
            logger.info(`${prefix}💾 Committing changes with message: "${chalk.cyan(commitMessage)}"`);
            await git.commit(commitMessage.trim());
            newCommitCreated = true;
        } else {
            logger.info(`${prefix}⏭️  Skipping commit - continuing with PR check`);
        }
    }

    // Step 4: Push all commits if there are any unpushed commits (existing or newly created)
    if (unpushedCommits.hasUnpushedCommits || newCommitCreated) {
        const totalCommitsToPush = unpushedCommits.commitsCount + (newCommitCreated ? 1 : 0);
        logger.info(
            `${prefix}🚀 Pushing ${chalk.yellow(totalCommitsToPush.toString())} commit${totalCommitsToPush === 1 ? '' : 's'}...`,
        );
        
        // Check if branch has an upstream set
        const currentStatus = await git.status();
        const currentBranch = currentStatus.current;
        
        if (!currentBranch) {
            throw new UsageError('Could not determine current branch name');
        }
        
        // Check if tracking branch exists
        const hasUpstream = currentStatus.tracking !== null;
        
        if (hasUpstream) {
            await git.push();
        } else {
            // No upstream set, use --set-upstream
            await git.push('origin', currentBranch, { '--set-upstream': null });
        }
        
        logger.info(`${prefix}✅ Successfully pushed all commits`);
    } else if (!statusInfo.hasUncommittedChanges) {
        logger.info(`${prefix}✅ Repository is clean - no commits to push or changes to commit`);
    }

    // Step 5: Ensure PR exists (or create it)
    logger.info(`${prefix}🔍 Checking if PR exists...`);
    const existingPr = await findMatchingPr(githubClient, githubConfig, issueId);

    if (existingPr) {
        logger.info(`${prefix}✅ PR already exists: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
        logger.info(`${prefix}🔗 PR URL: ${chalk.blueBright(chalk.underline(existingPr.html_url))}`);
        return;
    }

    // No PR exists, create one
    logger.info(`${prefix}📝 Creating draft PR...`);

    // Get current branch (we may not have it yet if no commits were pushed)
    const currentStatus = await git.status();
    const currentBranch = currentStatus.current;
    if (!currentBranch) {
        throw new UsageError('Could not determine current branch name');
    }

    const prTitle = generatePrTitle(issueId);
    const prBody = generatePrBody(issueId);

    try {
        const pr = await createDraftPr({
            client: githubClient,
            config: githubConfig,
            title: prTitle,
            body: prBody,
            head: currentBranch,
            base: baseBranch,
        });

        logger.info(`${prefix}✅ Created draft PR: ${chalk.blue(pr.title)} (#${pr.number})`);
        logger.info(`${prefix}🔗 PR URL: ${chalk.blueBright(chalk.underline(pr.html_url))}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`${prefix}❌ Failed to create PR: ${errorMessage}`);
        logger.error(
            `${prefix}📋 Details: owner=${githubConfig.owner}, repo=${githubConfig.repo}, branch=${currentBranch}, base=${baseBranch}`,
        );
        throw new UsageError(`Failed to create PR for ${repoDisplayName}: ${errorMessage}`);
    }
}
