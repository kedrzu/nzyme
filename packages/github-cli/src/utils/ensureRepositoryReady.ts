import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { assertNoConflicts } from './assertNoConflicts.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import { createDraftPr } from './createDraftPr.js';
import type { GithubClient } from './createGithubClient.js';
import { findPrForBranch } from './findMatchingPr.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Count the commits `branch` carries beyond `baseBranch`.
 *
 * Returns `null` when the base cannot be resolved locally — the remote-tracking ref may simply not
 * be fetched — so a caller can tell "nothing to do" apart from "could not tell", and only the first
 * of those is grounds for skipping work.
 */
async function countCommitsAhead(git: SimpleGit, baseBranch: string, branch: string): Promise<number | null> {
    for (const base of [`origin/${baseBranch}`, baseBranch]) {
        try {
            const count = await git.raw(['rev-list', '--count', `${base}..${branch}`]);
            return parseInt(count.trim(), 10);
        } catch {
            // Unresolvable ref — try the next candidate.
        }
    }

    return null;
}

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
     * Optional repository display name (for logging, e.g., "nzyme").
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

    /**
     * Whether to prompt for PR title when creating PR.
     */
    promptForPrTitle?: boolean;
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
        promptForPrTitle = false,
    } = params;

    const displayName = chalk.magenta(repoDisplayName);

    // Step 1: Check for uncommitted changes and unpushed commits
    const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(git), getGitStatusInfo(git)]);

    let newCommitCreated = false;

    // Step 2: Check for conflicts before committing
    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName, operation: 'merge', logger });
    }

    // Step 3: Show unpushed commits if any
    if (unpushedCommits.hasUnpushedCommits) {
        logger.info(
            `   ${displayName}: ${chalk.yellow(unpushedCommits.commitsCount.toString())} unpushed commit${
                unpushedCommits.commitsCount === 1 ? '' : 's'
            }`,
        );
    }

    // Step 3: Handle uncommitted changes
    if (statusInfo.hasUncommittedChanges) {
        const hasUnstagedFiles = statusInfo.totalChanges > statusInfo.changes.staged;

        logger.info(
            `   ${displayName}: ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
                statusInfo.totalChanges === 1 ? '' : 's'
            } (${chalk.yellow(statusInfo.changeDescription)})`,
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
        }

        if (shouldCommit === 'yes') {
            if (hasUnstagedFiles) {
                await git.add('.');
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

            logger.info(`   ${displayName}: committing "${chalk.cyan(commitMessage)}"`);
            await git.commit(commitMessage.trim());
            newCommitCreated = true;
        } else {
            logger.info(`   ${displayName}: skipping commit`);
        }
    }

    // Step 4: Push all commits if there are any unpushed commits (existing or newly created)
    if (unpushedCommits.hasUnpushedCommits || newCommitCreated) {
        const totalCommitsToPush = unpushedCommits.commitsCount + (newCommitCreated ? 1 : 0);
        logger.info(
            `   ${displayName}: pushing ${chalk.yellow(totalCommitsToPush.toString())} commit${totalCommitsToPush === 1 ? '' : 's'}...`,
        );

        await pushWithUpstream(git);

        logger.info(`   ${chalk.green('✓')} Pushed ${displayName}`);
    }

    // Step 5: Ensure PR exists (or create it)
    const currentStatus = await git.status();
    const currentBranch = currentStatus.current;
    if (!currentBranch) {
        throw new UsageError('Could not determine current branch name');
    }

    // Matched on the branch rather than on the issue ID: a stacked task has one PR per node, all
    // carrying the same issue ID, so only the branch identifies the PR this repository needs.
    const existingPr = await findPrForBranch(githubClient, githubConfig, issueId, currentBranch);

    if (existingPr) {
        logger.info(
            `   ${displayName}: PR exists - ${chalk.blue(existingPr.title)} ${chalk.gray(`#${existingPr.number}`)}`,
        );
        return;
    }

    // A pull request needs something to contain. A repository sitting on the task's branch with no
    // commits beyond the base — the ordinary case for a submodule when only the main repository
    // changed — would otherwise reach `pulls.create` and come back with GitHub's "No commits
    // between", which reads as a broken tool rather than as nothing to do.
    const commitsAhead = await countCommitsAhead(git, baseBranch, currentBranch);
    if (commitsAhead === 0) {
        logger.info(`   ${displayName}: no commits beyond ${chalk.cyan(baseBranch)} — nothing to open a PR for`);
        return;
    }

    let prTitle = generatePrTitle(issueId);
    const prBody = generatePrBody(issueId);

    // Prompt for PR title if requested (always prompt, even with --yes flag)
    if (promptForPrTitle) {
        const response = await enquirer.prompt<{ prTitle: string }>({
            type: 'input',
            name: 'prTitle',
            message: `Enter PR title for ${repoDisplayName}:`,
            initial: prTitle.replace(`[${issueId}] `, '').replace(` [${issueId}]`, ''),
            validate: (input: string) => {
                if (!input.trim()) {
                    return 'PR title cannot be empty';
                }
                return true;
            },
        });
        prTitle = `${response.prTitle.trim()} [${issueId}]`;
    }

    try {
        const pr = await createDraftPr({
            client: githubClient,
            config: githubConfig,
            title: prTitle,
            body: prBody,
            head: currentBranch,
            base: baseBranch,
        });

        logger.info(`   ${chalk.green('✓')} Created draft PR: ${chalk.blue(pr.title)} ${chalk.gray(`#${pr.number}`)}`);
        logger.info(`   ${chalk.blueBright(chalk.underline(pr.html_url))}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`   ${displayName}: failed to create PR: ${errorMessage}`);
        throw new UsageError(`Failed to create PR for ${repoDisplayName}: ${errorMessage}`);
    }
}
