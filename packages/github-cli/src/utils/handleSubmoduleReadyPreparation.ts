import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { assertValue } from '@nzyme/utils';

import type { GithubConfig } from '../GithubConfig.js';
import { assertNoConflicts } from './assertNoConflicts.js';
import { assertSubmoduleReady } from './assertSubmoduleReady.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import type { GithubClient } from './createGithubClient.js';
import { describeChangedPaths } from './describeChangedPaths.js';
import { ensureRepositoryReady } from './ensureRepositoryReady.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { parkSubmoduleOnBase } from './parkSubmoduleOnBase.js';
import { pushWithUpstream } from './pushWithUpstream.js';
import { submoduleBranchFromPrTitle } from './submoduleBranchFromPrTitle.js';

/**
 * Parameters for handling submodule preparation.
 */
export interface HandleSubmoduleReadyPreparationParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the **main** repository. Only its token is used here: every
     * submodule's own owner/repo is derived from its remote URL via `getSubmoduleGithubConfig`.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Branch a submodule's pull request is opened against, and the one a submodule is parked on
     * once its own pull request has merged.
     */
    baseBranch: string;

    /**
     * The caller project's base branches, used to tell a submodule resting on a base branch apart
     * from one carrying work of its own. Supplied by the caller — this package is generic and must
     * never hardcode a project's own branch naming.
     */
    baseBranches: string[];

    /**
     * Whether nobody can be asked a question — see `decideUnattendedMode`. Unattended, this path
     * must not invent a branch, a commit message or a pull request for a submodule; it may only
     * assert the submodule is already ready and refuse by name when it is not.
     */
    unattended: boolean;
}

/**
 * Prepare every submodule for the main repository's push, and stage the resulting gitlink.
 *
 * With a human present this walks the ladder in {@link prepareSubmoduleInteractively}: commit,
 * branch, push, pull request. Unattended it only *verifies* — `assertSubmoduleReady` refuses by
 * name when a submodule is dirty, unpushed or has no pull request of its own, because a branch,
 * a commit message or a pull request generated from this repository's task belongs to this
 * repository, not to the independent one the submodule points at (see
 * `docs/decisions/submodule-branch-resolved-from-gitlink-sha.md`).
 *
 * Either way it ends by staging each submodule's new commit in the main repository, which is what
 * makes the main repository start pointing at the work that was just published.
 */
export async function handleSubmoduleReadyPreparation(params: HandleSubmoduleReadyPreparationParams): Promise<void> {
    const { githubClient, githubConfig, logger, baseBranch, baseBranches, unattended } = params;

    const submodules = await getSubmoduleInfo();

    if (submodules.length === 0) {
        return;
    }

    logger.info('');
    logger.info(chalk.bold('📦 Processing submodules...'));

    for (const submodule of submodules) {
        const subName = chalk.magenta(submodule.name);
        const state = describeSubmoduleState(submodule, baseBranches);
        if (state) {
            logger.info(`   ${subName}: ${state}`);
        }

        const submoduleConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
        if (!submoduleConfig) {
            const errorMessage = `Could not parse GitHub URL for submodule: ${submodule.url}`;
            logger.error(`   ${subName}: ${errorMessage}`);
            throw new UsageError(errorMessage);
        }

        if (unattended) {
            const readiness = await assertSubmoduleReady({
                submodule,
                baseBranches,
                githubClient,
                githubConfig: submoduleConfig,
            });

            // Parking is safe to do here, unlike in a guard slot: the reset moves the gitlink, and
            // the `updateSubmoduleReference` below gives that change somewhere to land.
            if (readiness.kind === 'park-on-base') {
                await parkSubmoduleOnBase({
                    git: simpleGit({ baseDir: submodule.path }),
                    baseBranch,
                    logger,
                    repoDisplayName: submodule.name,
                });
            }
        } else {
            await prepareSubmoduleInteractively({
                submodule,
                githubClient,
                githubConfig: submoduleConfig,
                logger,
                baseBranch,
                baseBranches,
            });
        }

        await updateSubmoduleReference(submodule, logger);
    }
}

/**
 * Inputs to {@link prepareSubmoduleInteractively}.
 */
interface PrepareSubmoduleInteractivelyParams {
    /**
     * The submodule to walk the ladder for.
     */
    submodule: SubmoduleInfo;

    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the submodule's OWN repository.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Branch the submodule's pull request is opened against.
     */
    baseBranch: string;

    /**
     * The caller project's base branches — see `HandleSubmoduleReadyPreparationParams.baseBranches`.
     */
    baseBranches: string[];
}

/**
 * Walk a human through publishing one submodule's work: commit it, put it on a branch of its own,
 * push it, and open a pull request — one question per decision, and none for anything that can be
 * derived.
 *
 * The commit is deliberately deferred until after the branch question. Committing first would put
 * the work on whatever the submodule currently sits on, and when that is a base branch it leaves
 * the local base permanently ahead of its remote — the exact state `parkSubmoduleOnBase` later
 * refuses to reset. The human is still *asked* about the commit first, so the order of the
 * questions follows the order of the work.
 */
async function prepareSubmoduleInteractively(params: PrepareSubmoduleInteractivelyParams): Promise<void> {
    const { submodule, githubClient, githubConfig, logger, baseBranch, baseBranches } = params;

    const git = simpleGit({ baseDir: submodule.path });
    const displayName = chalk.magenta(submodule.name);

    const commitMessage = await confirmSubmoduleCommit({ git, submodule, logger });

    const hasWorkToPublish = commitMessage !== null || submodule.unpushedCommitsCount > 0;
    const onBaseBranch = submodule.currentBranch !== undefined && baseBranches.includes(submodule.currentBranch);

    // Work resting on a base branch or a detached HEAD has no branch of its own to be pushed to,
    // so it gets offered one — named after the pull request it is about to open, which is the one
    // thing a human has to decide here.
    const agreedPrTitle =
        hasWorkToPublish && (submodule.detached || onBaseBranch)
            ? await createBranchForPullRequest({ git, repoDisplayName: submodule.name, logger })
            : null;

    if (commitMessage !== null) {
        await git.add('.');
        await git.commit(commitMessage);
        logger.info(`   ${chalk.green('✓')} Committed in ${displayName} with message: "${chalk.cyan(commitMessage)}"`);
    }

    const status = await git.status();
    if (status.detached || !status.current) {
        // A detached HEAD is the ordinary state of a gitlink-pinned submodule, and there is no
        // branch to push or to open a pull request for. It only deserves a word when there was
        // work to publish and the branch offered above was declined: a commit reachable from a
        // detached HEAD alone exists in this one checkout and nowhere else.
        if (hasWorkToPublish) {
            logger.warn(`   ⚠️  ${displayName}: HEAD is detached — work left here lives only in this checkout`);
        }

        return;
    }

    if (baseBranches.includes(status.current)) {
        // Still on a base branch: either there was nothing to publish, or a pull request was
        // declined. A base branch is nobody's pull request, so pushing what it carries is all
        // that is left to do — and `ensureRepositoryReady` is deliberately not used for it, since
        // its "commits beyond the base" measure would read a base branch as a candidate head.
        const unpushed = await checkUnpushedCommits(git);
        if (unpushed.hasUnpushedCommits) {
            logger.info(
                `   ${displayName}: pushing ${chalk.yellow(unpushed.commitsCount.toString())} commit${
                    unpushed.commitsCount === 1 ? '' : 's'
                }...`,
            );
            await pushWithUpstream(git);
            logger.info(`   ${chalk.green('✓')} Pushed ${displayName}`);
        }

        return;
    }

    await ensureRepositoryReady({
        githubClient,
        githubConfig,
        logger,
        baseBranch,
        git,
        repoDisplayName: submodule.name,
        prTitle: agreedPrTitle ?? (await lastCommitSubject(git, submodule.name)),
        // A title agreed while naming the branch is not asked for twice; without one, the branch
        // predates this run and its pull request is still an open question.
        confirmPullRequest: agreedPrTitle === null,
    });
}

/**
 * Inputs to {@link confirmSubmoduleCommit}.
 */
interface ConfirmSubmoduleCommitParams {
    /**
     * Git instance scoped to the submodule working tree.
     */
    git: SimpleGit;

    /**
     * The submodule being asked about.
     */
    submodule: SubmoduleInfo;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Ask whether to commit a submodule's pending changes, and with what message.
 *
 * "Whether" is a decision and is asked; "what to call it" is not, and is generated from the paths
 * that actually changed — the caller does not type a commit message while pushing. The message is
 * `describeChangedPaths` alone, with none of the main repository's own default text: that text
 * names this repository's task, and the submodule is an independent repository with its own
 * commit conventions.
 * @returns The message to commit with, or `null` when there is nothing to commit or the human
 * declined. The commit itself is left to the caller, which may have to create a branch for it first.
 */
async function confirmSubmoduleCommit(params: ConfirmSubmoduleCommitParams): Promise<string | null> {
    const { git, submodule, logger } = params;

    const displayName = chalk.magenta(submodule.name);
    const statusInfo = await getGitStatusInfo(git);

    // A conflicted tree is never "changes to commit" — committing it would record the conflict
    // markers. Same guard every other path has before touching a working tree.
    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName: submodule.name, operation: 'merge', logger });
    }

    if (!statusInfo.hasUncommittedChanges) {
        return null;
    }

    const plural = statusInfo.totalChanges === 1 ? '' : 's';
    logger.info(
        `   ${displayName}: ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${plural} (${chalk.yellow(statusInfo.changeDescription)})`,
    );

    const { shouldCommit } = await enquirer.prompt<{ shouldCommit: 'no' | 'yes' }>({
        type: 'select',
        name: 'shouldCommit',
        message: `Commit ${statusInfo.totalChanges} change${plural} in ${submodule.name}?`,
        choices: [
            { name: 'yes', message: `Yes, commit ${statusInfo.totalChanges} change${plural}` },
            { name: 'no', message: 'No, skip committing' },
        ],
    });

    if (shouldCommit === 'no') {
        logger.info(`   ${displayName}: skipping commit`);
        return null;
    }

    // `hasUncommittedChanges` above guarantees at least one changed path, so a description always
    // exists here — there is no invented default to fall back to.
    return assertValue(
        describeChangedPaths(statusInfo.changedPaths),
        'unreachable: hasUncommittedChanges implies at least one changed path',
    );
}

/**
 * Inputs to {@link createBranchForPullRequest}.
 */
interface CreateBranchForPullRequestParams {
    /**
     * Git instance scoped to the submodule working tree.
     */
    git: SimpleGit;

    /**
     * Display name of the submodule, as it appears in the questions.
     */
    repoDisplayName: string;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Offer to move a submodule's work onto a branch of its own and open a pull request for it.
 *
 * The branch name is derived from the pull request title rather than asked for separately —
 * {@link submoduleBranchFromPrTitle} turns a Conventional-Commits title into the `<type>/<slug>`
 * shape — but it is still shown and editable, because it is the name that outlives this run.
 * Nothing about it comes from the main repository's branch or task.
 * @returns The agreed pull request title, or `null` when the offer was declined — in which case
 * the submodule is left exactly where it was.
 */
async function createBranchForPullRequest(params: CreateBranchForPullRequestParams): Promise<string | null> {
    const { git, repoDisplayName, logger } = params;

    const { shouldOpen } = await enquirer.prompt<{ shouldOpen: 'no' | 'yes' }>({
        type: 'select',
        name: 'shouldOpen',
        message: `Open a pull request for this work in ${repoDisplayName}?`,
        choices: [
            { name: 'yes', message: 'Yes, put it on a branch and open a pull request' },
            { name: 'no', message: 'No, leave it where it is' },
        ],
    });

    if (shouldOpen === 'no') {
        return null;
    }

    const { prTitle } = await enquirer.prompt<{ prTitle: string }>({
        type: 'input',
        name: 'prTitle',
        message: `Enter PR title for ${repoDisplayName}:`,
        validate: (input: string) => (input.trim() ? true : 'PR title cannot be empty'),
    });

    const { branchName } = await enquirer.prompt<{ branchName: string }>({
        type: 'input',
        name: 'branchName',
        message: `Enter branch name for ${repoDisplayName}:`,
        initial: submoduleBranchFromPrTitle(prTitle.trim()),
        validate: (input: string) => (input.trim() ? true : 'Branch name cannot be empty'),
    });

    await git.checkout(['-b', branchName.trim()]);
    logger.info(`   ${chalk.green('✓')} Created ${chalk.cyan(branchName.trim())} in ${chalk.magenta(repoDisplayName)}`);

    return prTitle.trim();
}

/**
 * The subject line of a branch's last commit, offered as the default pull request title for a
 * branch that predates this run — the closest thing to a title its author has already written.
 */
async function lastCommitSubject(git: SimpleGit, repoDisplayName: string): Promise<string> {
    const log = await git.log({ maxCount: 1 });
    return log.latest?.message ?? `Changes in ${repoDisplayName}`;
}

/**
 * Summarise what is worth reporting about a submodule before acting on it: unsaved work, unshared
 * work, and whether it is standing somewhere other than a base branch.
 * @returns The summary, or `null` when the submodule is resting on a base branch with nothing
 * pending — there is nothing to say about it.
 * @__NO_SIDE_EFFECTS__
 */
function describeSubmoduleState(submodule: SubmoduleInfo, baseBranches: string[]): string | null {
    const details: string[] = [];

    if (submodule.hasChanges) {
        details.push('uncommitted changes');
    }

    if (submodule.unpushedCommitsCount > 0) {
        details.push(
            `${submodule.unpushedCommitsCount} unpushed commit${submodule.unpushedCommitsCount === 1 ? '' : 's'}`,
        );
    }

    if (submodule.detached) {
        details.push('detached HEAD');
    } else if (submodule.currentBranch && !baseBranches.includes(submodule.currentBranch)) {
        details.push(`on ${chalk.cyan(submodule.currentBranch)}`);
    }

    return details.length > 0 ? details.join(', ') : null;
}

/**
 * Stage the submodule's current commit in the main repository.
 *
 * The only thing that makes the main repository start pointing at what was just published in the
 * submodule: without it the submodule's commits are pushed and the superproject still references
 * the old ones — a gitlink pointing at work nobody's branch contains. `pushSubmoduleUpdates` does
 * not cover this, because in `pushChanges` it has already run by the time this does.
 */
async function updateSubmoduleReference(submodule: SubmoduleInfo, logger: Logger): Promise<void> {
    const mainGit = simpleGit();
    await mainGit.add(submodule.path);
    logger.info(`   ${chalk.green('✓')} Updated ${chalk.magenta(submodule.name)} reference in main repository`);
}
