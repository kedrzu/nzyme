import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import { createDraftPr } from './createDraftPr.js';
import type { GithubClient } from './createGithubClient.js';
import { findOpenPrForBranch } from './findMatchingPr.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for ensuring a repository is ready.
 */
export interface EnsureRepositoryReadyParams {
    /**
     * GitHub client for the repository being published — a submodule's own, never the main
     * repository's.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration (owner, repo, token) of that same repository.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Branch the pull request targets, and the one "is there anything to open a pull request for"
     * is measured against.
     */
    baseBranch: string;

    /**
     * Optional SimpleGit instance (uses current directory if not provided).
     */
    git?: SimpleGit;

    /**
     * Optional repository display name (for logging and prompts, e.g. "nzyme").
     */
    repoDisplayName?: string;

    /**
     * Title for the pull request, when one has to be created: used verbatim when
     * {@link confirmPullRequest} is `false` — the human has already been asked for it, while
     * naming the branch — and offered as the editable default when it is `true`.
     *
     * Always supplied by the caller, never generated here. A title is one of the few genuine
     * decisions in publishing a change, and it must carry nothing of the main repository's task:
     * the repository this runs against is independent, with its own naming conventions (see
     * `docs/decisions/submodule-branch-resolved-from-gitlink-sha.md`).
     */
    prTitle: string;

    /**
     * Whether to ask before opening the pull request, and let the human edit {@link prTitle}.
     *
     * Asked here rather than by the caller because only this function knows a pull request is
     * actually needed — the branch may already have one, or carry nothing beyond the base branch,
     * and a question about a pull request that is not going to be created is worse than no
     * question at all.
     */
    confirmPullRequest: boolean;
}

/**
 * Publish a repository's branch: push whatever it carries that its remote does not have, then make
 * sure the branch has an open pull request, creating a draft one if it does not.
 *
 * Committing is deliberately NOT part of this — the caller commits first, because a repository
 * sitting on a base branch needs its branch created in between deciding to commit and committing,
 * or the commit lands on the base branch and leaves it permanently ahead of its remote.
 *
 * Only ever reached with a human present: unattended, `handleSubmoduleReadyPreparation` asserts
 * readiness and refuses instead, so that nothing invents a branch, a commit or a pull request in
 * a repository that is not this one.
 */
export async function ensureRepositoryReady(params: EnsureRepositoryReadyParams): Promise<void> {
    const {
        githubClient,
        githubConfig,
        logger,
        baseBranch,
        git = simpleGit(),
        repoDisplayName = 'repository',
        prTitle,
        confirmPullRequest,
    } = params;

    const displayName = chalk.magenta(repoDisplayName);

    // Step 1: Push everything the remote does not have yet
    const unpushedCommits = await checkUnpushedCommits(git);

    if (unpushedCommits.hasUnpushedCommits) {
        logger.info(
            `   ${displayName}: pushing ${chalk.yellow(unpushedCommits.commitsCount.toString())} commit${
                unpushedCommits.commitsCount === 1 ? '' : 's'
            }...`,
        );

        await pushWithUpstream(git);

        logger.info(`   ${chalk.green('✓')} Pushed ${displayName}`);
    }

    // Step 2: Ensure a pull request exists (or create it)
    const currentStatus = await git.status();
    const currentBranch = currentStatus.current;
    if (!currentBranch) {
        throw new UsageError('Could not determine current branch name');
    }

    // Matched on the branch alone: this repository's pull requests carry nothing that ties them to
    // the main repository's task, so the branch is the only thing that identifies the one it needs.
    const existingPr = await findOpenPrForBranch(githubClient, githubConfig, currentBranch);

    if (existingPr) {
        logger.info(
            `   ${displayName}: PR exists - ${chalk.blue(existingPr.title)} ${chalk.gray(`#${existingPr.number}`)}`,
        );
        return;
    }

    // A pull request needs something to contain. A repository sitting on a branch with no commits
    // beyond the base — the ordinary case for a submodule when only the main repository changed —
    // would otherwise reach `pulls.create` and come back with GitHub's "No commits between", which
    // reads as a broken tool rather than as nothing to do.
    const commitsAhead = await countCommitsAhead(git, baseBranch, currentBranch);
    if (commitsAhead === 0) {
        logger.info(`   ${displayName}: no commits beyond ${chalk.cyan(baseBranch)} — nothing to open a PR for`);
        return;
    }

    const title = confirmPullRequest
        ? await confirmPullRequestTitle({ repoDisplayName, currentBranch, defaultTitle: prTitle })
        : prTitle;

    if (title === null) {
        logger.info(`   ${displayName}: skipping pull request for ${chalk.cyan(currentBranch)}`);
        return;
    }

    try {
        const pr = await createDraftPr({
            client: githubClient,
            config: githubConfig,
            title,
            // Deliberately empty: a body generated from the main repository's task would put that
            // task's vocabulary into an independent repository's pull request. The author fills it in.
            body: '',
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

/**
 * Inputs to {@link confirmPullRequestTitle}.
 */
interface ConfirmPullRequestTitleParams {
    /**
     * Display name of the repository, as it appears in the questions.
     */
    repoDisplayName: string;

    /**
     * Branch the pull request would be opened for.
     */
    currentBranch: string;

    /**
     * Title offered as the editable default.
     */
    defaultTitle: string;
}

/**
 * Ask whether to open a pull request for a branch and, if so, what to call it.
 * @returns The title to use, or `null` when the human declined the pull request.
 */
async function confirmPullRequestTitle(params: ConfirmPullRequestTitleParams): Promise<string | null> {
    const { repoDisplayName, currentBranch, defaultTitle } = params;

    const { shouldOpen } = await enquirer.prompt<{ shouldOpen: 'no' | 'yes' }>({
        type: 'select',
        name: 'shouldOpen',
        message: `Open a pull request for branch ${currentBranch} in ${repoDisplayName}?`,
        choices: [
            { name: 'yes', message: 'Yes, open a draft pull request' },
            { name: 'no', message: 'No, just leave the branch pushed' },
        ],
    });

    if (shouldOpen === 'no') {
        return null;
    }

    const { prTitle } = await enquirer.prompt<{ prTitle: string }>({
        type: 'input',
        name: 'prTitle',
        message: `Enter PR title for ${repoDisplayName}:`,
        initial: defaultTitle,
        validate: (input: string) => (input.trim() ? true : 'PR title cannot be empty'),
    });

    return prTitle.trim();
}

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
            return Number.parseInt(count.trim(), 10);
        } catch {
            // Unresolvable ref — try the next candidate.
        }
    }

    return null;
}
