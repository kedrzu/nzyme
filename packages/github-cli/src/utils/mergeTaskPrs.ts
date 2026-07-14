import chalk from 'chalk';
import enquirer from 'enquirer';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { convertPrToReady } from './convertPrToReady.js';
import type { GithubClient } from './createGithubClient.js';
import { countUnresolvedReviewThreads } from './countUnresolvedReviewThreads.js';
import { findMatchingPr, findMergedPr } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { mergePullRequestSquash } from './mergePullRequestSquash.js';
import { refreshMainAfterSubmoduleMerge } from './refreshMainAfterSubmoduleMerge.js';
import { waitForRequiredChecks } from './waitForRequiredChecks.js';

/**
 * A GitHub pull request as returned by the REST list/get endpoints.
 */
type PullRequest = NonNullable<Awaited<ReturnType<typeof findMatchingPr>>>;

/**
 * Parameters for {@link mergeTaskPrs}.
 */
export interface MergeTaskPrsParams {
    /**
     * GitHub client.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration for the main repository.
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID used to find the matching PRs.
     */
    issueId: string;

    /**
     * Base branch of the main repository (e.g. 'main').
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Skip the interactive confirmation and draft-conversion prompts.
     */
    autoYes: boolean;

    /**
     * Poll interval for required-check waiting, in milliseconds.
     */
    checkPollIntervalMs?: number;

    /**
     * Timeout for required-check waiting, in milliseconds.
     */
    checkPollTimeoutMs?: number;
}

/**
 * A submodule that participates in the current task (has an open or already-merged PR).
 */
interface SubmoduleTarget {
    name: string;
    path: string;
    config: GithubConfig;
    /**
     * The open PR to squash-merge in this run, if any.
     */
    openPr: PullRequest | null;
}

/**
 * Squash-merge the current task's PRs, submodules first.
 *
 * Submodules must merge before the main repository: a squash merge rewrites the submodule's base
 * branch, so the main repo's gitlinks must then be re-pointed at the merged commits (via
 * {@link refreshMainAfterSubmoduleMerge}) before the main PR is merged — otherwise the merged main
 * branch would reference orphaned submodule commits.
 *
 * Resume-safe: a submodule whose PR was already merged in a prior (partial) run is still refreshed,
 * and a task whose main PR is already merged exits cleanly.
 */
export async function mergeTaskPrs(params: MergeTaskPrsParams): Promise<void> {
    const {
        githubClient,
        githubConfig,
        issueId,
        baseBranch,
        logger,
        autoYes,
        checkPollIntervalMs,
        checkPollTimeoutMs,
    } = params;

    // Capture the branch we start on so we can confirm we stay on it (no local switch — see below).
    const currentBranch = await getCurrentBranch();

    // === Discover the main PR first (guard before touching anything) ===
    const mainPr = await findMatchingPr(githubClient, githubConfig, issueId);
    if (!mainPr) {
        const mergedMainPr = await findMergedPr(githubClient, githubConfig, issueId);
        if (mergedMainPr) {
            logger.info(
                `✅ Main PR ${chalk.gray(`#${mergedMainPr.number}`)} for ${chalk.bold(issueId)} is already merged — nothing to do.`,
            );
            return;
        }
        throw new UsageError(`No open GitHub PR found for task ${chalk.bold(issueId)} in the main repository.`);
    }

    // === Guard: every submodule must be clean ===
    // The merge runs entirely via the GitHub API against already-pushed commits, so any uncommitted
    // submodule changes would be silently left out of the merged result — fail loudly instead.
    await assertSubmodulesClean(logger);

    // === Discover task submodules (open or already-merged PRs) ===
    const submoduleTargets = await discoverSubmoduleTargets(githubClient, githubConfig, issueId, logger);

    // === Confirmation summary ===
    // When there is nothing to inspect (no unresolved comments) the merge proceeds non-interactively,
    // including auto-converting any draft PR — we still wait for required checks before each merge.
    const skipDraftPrompts = await confirmMerge({
        githubClient,
        mainConfig: githubConfig,
        mainPr,
        submoduleTargets,
        autoYes,
        logger,
    });

    // === Merge submodule PRs first (in discovery order) ===
    for (const target of submoduleTargets) {
        if (!target.openPr) {
            continue;
        }

        logger.info('');
        logger.info(
            `🔀 Merging submodule ${chalk.magenta(target.name)} PR ${chalk.gray(`#${target.openPr.number}`)}...`,
        );
        await ensureNotDraft({
            githubClient,
            config: target.config,
            prNumber: target.openPr.number,
            isDraft: target.openPr.draft,
            label: `Submodule ${target.name}`,
            autoYes: skipDraftPrompts,
            logger,
        });
        await waitForRequiredChecks({
            client: githubClient,
            config: target.config,
            prNumber: target.openPr.number,
            logger,
            intervalMs: checkPollIntervalMs,
            timeoutMs: checkPollTimeoutMs,
        });
        await mergePullRequestSquash(githubClient, target.config, target.openPr.number);
        logger.info(`   ${chalk.green('✓')} Squash-merged submodule ${chalk.magenta(target.name)} PR`);
    }

    // === Refresh the main branch so gitlinks point at the merged submodule commits ===
    // The returned SHA is the commit we just pushed; the main PR's checks are gated on it so a
    // stale PR head (pre-push) does not surface the previous commit's failing checks.
    const refreshedMainHeadSha = await refreshMainAfterSubmoduleMerge({
        refreshedSubmodulePaths: submoduleTargets.map(target => target.path),
        baseBranch,
        logger,
    });

    // === Merge the main PR (re-fetch for fresh draft/SHA state) ===
    logger.info('');
    logger.info(`🔀 Merging main repository PR ${chalk.gray(`#${mainPr.number}`)}...`);
    const { data: freshMainPr } = await githubClient.rest.pulls.get({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        pull_number: mainPr.number,
    });
    await ensureNotDraft({
        githubClient,
        config: githubConfig,
        prNumber: mainPr.number,
        isDraft: freshMainPr.draft,
        label: 'Main repository',
        autoYes: skipDraftPrompts,
        logger,
    });
    await waitForRequiredChecks({
        client: githubClient,
        config: githubConfig,
        prNumber: mainPr.number,
        logger,
        intervalMs: checkPollIntervalMs,
        timeoutMs: checkPollTimeoutMs,
        expectedHeadSha: refreshedMainHeadSha,
    });
    await mergePullRequestSquash(githubClient, githubConfig, mainPr.number);
    logger.info(`   ${chalk.green('✓')} Squash-merged main repository PR`);

    // Stay on the current branch: the merge is done entirely via the GitHub API, and switching to
    // the base branch locally would fail under git worktrees (the base branch is checked out in
    // another worktree). GitHub may have deleted the remote branch on merge — that is fine.
    logger.info('');
    logger.info(
        `🎉 Merged task ${chalk.bold(issueId)} (squash). Staying on ${chalk.cyan(currentBranch)} ` +
            `(merged via the GitHub API — no local branch switch).`,
    );
}

/**
 * Discover submodules that participate in the task — those with an open or already-merged PR.
 */
async function discoverSubmoduleTargets(
    githubClient: GithubClient,
    githubConfig: GithubConfig,
    issueId: string,
    logger: Logger,
): Promise<SubmoduleTarget[]> {
    const submodules = await getSubmoduleInfo();
    const targets: SubmoduleTarget[] = [];

    for (const submodule of submodules) {
        const config = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
        if (!config) {
            logger.warn(`⚠️  Could not parse GitHub URL for submodule ${chalk.magenta(submodule.name)} — skipping`);
            continue;
        }

        const openPr = await findMatchingPr(githubClient, config, issueId);
        const mergedPr = openPr ? null : await findMergedPr(githubClient, config, issueId);

        if (!openPr && !mergedPr) {
            continue;
        }

        targets.push({ name: submodule.name, path: submodule.path, config, openPr });
    }

    return targets;
}

/**
 * Abort the merge if any submodule has uncommitted changes. The merge is performed via the GitHub
 * API against already-pushed commits, so local uncommitted submodule work would be silently left out
 * of the merged result — fail loudly so the user can commit/push (or discard) it first.
 */
async function assertSubmodulesClean(logger: Logger): Promise<void> {
    const submodules = await getSubmoduleInfo();
    const dirty = submodules.filter(submodule => submodule.hasChanges);

    if (dirty.length === 0) {
        return;
    }

    logger.error('❌ Cannot merge — the following submodules have uncommitted changes:');
    for (const submodule of dirty) {
        logger.error(`   ${chalk.magenta(submodule.name)} ${chalk.gray(`(${submodule.path})`)}`);
    }

    throw new UsageError(
        `${dirty.length} submodule${dirty.length === 1 ? '' : 's'} ${dirty.length === 1 ? 'has' : 'have'} ` +
            `uncommitted changes. Commit, push, or discard them (e.g. \`task push\`) and try again.`,
    );
}

/**
 * Parameters for {@link confirmMerge}.
 */
interface ConfirmMergeParams {
    githubClient: GithubClient;
    mainConfig: GithubConfig;
    mainPr: PullRequest;
    submoduleTargets: SubmoduleTarget[];
    autoYes: boolean;
    logger: Logger;
}

/**
 * Log the merge plan — every PR, its clickable URL, and its unresolved-review-comment count — then
 * decide whether to prompt. The confirmation only exists to give the user a chance to inspect
 * unresolved review threads before merging over them, so it is shown only when at least one PR has
 * unresolved comments (and never with `autoYes`). When everything is resolved the merge proceeds
 * automatically. Throws {@link UsageError} if the user declines.
 *
 * @returns `true` when the rest of the merge should run non-interactively (because of `autoYes`, or
 * because there were no unresolved comments to inspect) — callers use this to also auto-convert any
 * draft PR instead of prompting. `false` when the user was prompted and confirmed.
 */
async function confirmMerge(params: ConfirmMergeParams): Promise<boolean> {
    const { githubClient, mainConfig, mainPr, submoduleTargets, autoYes, logger } = params;

    logger.info('');
    logger.info(chalk.bold('📋 The following PRs will be squash-merged (submodules first):'));

    let totalUnresolved = 0;

    for (const target of submoduleTargets) {
        if (target.openPr) {
            const unresolved = await countUnresolvedReviewThreads(githubClient, target.config, target.openPr.number);
            totalUnresolved += unresolved;
            logger.info(
                `   ${chalk.magenta(target.name)} ${chalk.gray(`#${target.openPr.number}`)} ${target.openPr.title} ` +
                    formatUnresolved(unresolved),
            );
            logger.info(`      ${chalk.blueBright(chalk.underline(target.openPr.html_url))}`);
        } else {
            logger.info(
                `   ${chalk.magenta(target.name)} ${chalk.gray('(PR already merged — will refresh reference)')}`,
            );
        }
    }

    const mainUnresolved = await countUnresolvedReviewThreads(githubClient, mainConfig, mainPr.number);
    totalUnresolved += mainUnresolved;
    logger.info(
        `   ${chalk.cyan(mainConfig.repo)} ${chalk.gray(`#${mainPr.number}`)} ${mainPr.title} ` +
            formatUnresolved(mainUnresolved),
    );
    logger.info(`      ${chalk.blueBright(chalk.underline(mainPr.html_url))}`);

    if (autoYes) {
        return true;
    }

    // All review comments resolved → nothing to inspect, so merge without prompting (and let the
    // caller auto-convert any draft PR too).
    if (totalUnresolved === 0) {
        logger.info('');
        logger.info(chalk.green('✅ All review comments resolved — merging automatically.'));
        return true;
    }

    logger.info('');
    const { proceed } = await enquirer.prompt<{ proceed: boolean }>({
        type: 'confirm',
        name: 'proceed',
        message: 'Some PRs have unresolved comments. Squash-merge these PRs?',
    });

    if (!proceed) {
        logger.info('Aborted — no PRs were merged.');
        throw new UsageError('Merge cancelled by user.');
    }

    return false;
}

/**
 * Format an unresolved-review-comment count for the confirmation summary.
 * @__NO_SIDE_EFFECTS__
 */
function formatUnresolved(count: number): string {
    if (count === 0) {
        return chalk.gray('(no unresolved comments)');
    }
    return chalk.yellow(`(${count} unresolved comment${count === 1 ? '' : 's'})`);
}

/**
 * Parameters for {@link ensureNotDraft}.
 */
interface EnsureNotDraftParams {
    githubClient: GithubClient;
    config: GithubConfig;
    prNumber: number;
    isDraft: boolean | null | undefined;
    label: string;
    autoYes: boolean;
    logger: Logger;
}

/**
 * Ensure a PR is ready for review. If it is a draft, prompt (or auto-convert when `autoYes`) to
 * convert it; declining aborts the merge with an actionable error.
 */
async function ensureNotDraft(params: EnsureNotDraftParams): Promise<void> {
    const { githubClient, config, prNumber, isDraft, label, autoYes, logger } = params;

    if (!isDraft) {
        return;
    }

    let convert = autoYes;
    if (!autoYes) {
        const { confirmed } = await enquirer.prompt<{ confirmed: boolean }>({
            type: 'confirm',
            name: 'confirmed',
            message: `${label} PR #${prNumber} is a draft. Convert it to ready for review and merge?`,
        });
        convert = confirmed;
    }

    if (!convert) {
        throw new UsageError(
            `${label} PR #${prNumber} is a draft — aborting. Convert it to ready (e.g. \`task ready\`) and try again.`,
        );
    }

    logger.info(`🚀 Converting ${label} PR ${chalk.gray(`#${prNumber}`)} from draft to ready...`);
    await convertPrToReady(githubClient, config, prNumber);
}
