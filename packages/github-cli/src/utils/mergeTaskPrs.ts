import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { waitFor } from '@nzyme/utils/waitFor.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import type { GithubConfig } from '../GithubConfig.js';
import { cascadeStack } from './cascadeStack.js';
import { convertPrToReady } from './convertPrToReady.js';
import { ensureLocalBranch } from './ensureLocalBranch.js';
import type { GithubClient } from './createGithubClient.js';
import { countUnresolvedReviewThreads } from './countUnresolvedReviewThreads.js';
import { findMatchingPr, findMergedPr, findTaskPrs } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { mergePullRequestSquash } from './mergePullRequestSquash.js';
import { refreshMainAfterSubmoduleMerge } from './refreshMainAfterSubmoduleMerge.js';
import type { PullRequestStack } from './stacksApi.js';
import { findStackForPr, getMergeAsyncStatus, mergeStackAsync } from './stacksApi.js';
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
 *
 * Run it from any node of a stack. The local half of the merge has to happen on the bottom node —
 * that is the node this refreshes, and the merge is gated on the commit the refresh produces — so it
 * checks that node out itself. Returning the user to where they started belongs to the caller, which
 * is the only layer that knows they are a user rather than a script.
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

    // === Discover the main PR(s) first (guard before touching anything) ===
    const mainPrs = await findTaskPrs(githubClient, githubConfig, issueId);
    if (mainPrs.length === 0) {
        const mergedMainPr = await findMergedPr(githubClient, githubConfig, issueId);
        if (mergedMainPr) {
            logger.info(
                `✅ Main PR ${chalk.gray(`#${mergedMainPr.number}`)} for ${chalk.bold(issueId)} is already merged — nothing to do.`,
            );
            return;
        }
        throw new UsageError(`No open GitHub PR found for task ${chalk.bold(issueId)} in the main repository.`);
    }

    // A task with several open PRs is a stack; GitHub's own stack record is what orders it, because
    // it is the thing that decides how the merge cascades. Several PRs with no stack behind them is
    // not something to guess at.
    const stack = await findStackForPr(githubClient, githubConfig, mainPrs[0]!.number);
    const stackNodes = stack ? orderNodes(mainPrs, stack) : null;

    if (!stackNodes && mainPrs.length > 1) {
        const prs = mainPrs.map(pr => `  #${pr.number} ${pr.head.ref}`).join('\n');
        throw new UsageError(
            `Task ${chalk.bold(issueId)} has ${mainPrs.length} open pull requests that are not a stack:\n${prs}\n` +
                'Stack them (`task stack`) or close the ones that should not merge.',
        );
    }

    const mainPr = stackNodes ? stackNodes[stackNodes.length - 1]! : mainPrs[0]!;
    const bottomNode = stackNodes?.[0];

    // === Guard: nothing moves while there is uncommitted work ===
    // The local half of a merge all happens on the checked-out branch — the base-branch refresh, the
    // gitlink re-point, the restack — and moving to the bottom node would carry a dirty tree onto it.
    // This refuses rather than committing for you: a merge is not the moment to invent a commit, and
    // an auto-commit here is exactly how a submodule pointer lands on the wrong node.
    await assertMainRepoClean(logger);

    // The merge runs against already-pushed commits, so uncommitted submodule work would be silently
    // left out of the merged result — fail loudly instead.
    await assertSubmodulesClean(logger);

    // === Move to the bottom node, which is where the local half of the merge has to happen ===
    // The refresh below merges the base branch into the checked-out branch (and re-points submodule
    // gitlinks), and the commit that produces is what the bottom node's check gate waits for.
    // Standing anywhere else would land the base merge inside another node's own diff and then wait
    // out the timeout for a commit the bottom node never gets. Which node the user happens to be on
    // is not their problem to solve, so this goes there itself; the caller puts them back afterwards.
    if (bottomNode && currentBranch !== bottomNode.head.ref) {
        await checkoutBottomNode(bottomNode.head.ref, baseBranch, logger);
    }

    // === Discover task submodules (open or already-merged PRs) ===
    // After the checkout: this reads the live working tree, so on any other node it would describe
    // the wrong node's submodule pins.
    const submoduleTargets = await discoverSubmoduleTargets(githubClient, githubConfig, issueId, logger);

    // === Guard: a stacked task keeps its submodule work in the bottom node ===
    // Everything above the bottom is squashed against a base that already carries the merged
    // submodule commit, so a gitlink moved higher up would be squashed as a revert of it.
    if (stackNodes && submoduleTargets.length > 0) {
        await assertSubmodulesOnlyInBottomNode({
            branches: stackNodes.map(node => node.head.ref),
            submodulePaths: submoduleTargets.map(target => target.path),
            logger,
        });
    }

    if (stackNodes) {
        logger.info('');
        logger.info(
            `🧱 Stack #${chalk.bold(stack!.number.toString())}: ${chalk.bold(stackNodes.length.toString())} PRs ` +
                `landing on ${chalk.cyan(stack!.base)} (bottom → top)`,
        );
        stackNodes.forEach((node, index) => {
            logger.info(
                `   ${index + 1}. ${chalk.cyan(node.head.ref)} ${chalk.gray(`#${node.number}`)}` +
                    `${node.draft ? chalk.yellow(' (draft)') : ''}`,
            );
        });
    }

    // === Confirmation summary ===
    // When there is nothing to inspect (no unresolved comments) the merge proceeds non-interactively,
    // including auto-converting any draft PR — we still wait for required checks before each merge.
    await confirmMerge({
        githubClient,
        mainConfig: githubConfig,
        mainPrs: stackNodes ?? [mainPr],
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
            autoYes: true,
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

    // === Restack: nodes above the bottom must carry the refreshed gitlinks ===
    // Only needed when the refresh actually added a commit to the bottom node; cascadeStack
    // skips nodes that already build on their parent's tip, so this is cheap when it did not.
    if (stackNodes) {
        await cascadeStack({ branches: stackNodes.map(node => node.head.ref), logger });
    }

    // === Merge the main PR(s) (re-fetch for fresh draft/SHA state) ===
    logger.info('');

    const nodesToMerge = stackNodes ?? [mainPr];

    for (const node of nodesToMerge) {
        const { data: freshPr } = await githubClient.rest.pulls.get({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            pull_number: node.number,
        });

        await ensureNotDraft({
            githubClient,
            config: githubConfig,
            prNumber: node.number,
            isDraft: freshPr.draft,
            label: stackNodes ? `Node ${chalk.cyan(node.head.ref)}` : 'Main repository',
            autoYes: true,
            logger,
        });

        await waitForRequiredChecks({
            client: githubClient,
            config: githubConfig,
            prNumber: node.number,
            logger,
            intervalMs: checkPollIntervalMs,
            timeoutMs: checkPollTimeoutMs,
            // Only the bottom node's head is the commit the gitlink refresh just pushed; the nodes
            // above were rewritten by the restack and carry their own fresh heads.
            expectedHeadSha: node === nodesToMerge[0] ? refreshedMainHeadSha : undefined,
        });
    }

    if (stackNodes) {
        // Merging the top pull request lands every node below it too, each as its own squash commit
        // and in stack order — one API call for the whole chain, and atomic, so a failure part-way
        // cannot leave the stack half-landed.
        const topNode = stackNodes[stackNodes.length - 1]!;
        logger.info(
            `🔀 Merging stack #${chalk.bold(stack!.number.toString())} via top PR ${chalk.gray(`#${topNode.number}`)}...`,
        );

        const { data: freshTopPr } = await githubClient.rest.pulls.get({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            pull_number: topNode.number,
        });

        const uuid = await mergeStackAsync(githubClient, githubConfig, topNode.number, freshTopPr.head.sha);
        await waitForStackMerge({
            githubClient,
            githubConfig,
            prNumber: topNode.number,
            uuid,
            nodeCount: stackNodes.length,
            logger,
            intervalMs: checkPollIntervalMs,
            timeoutMs: checkPollTimeoutMs,
        });
        logger.info(`   ${chalk.green('✓')} Squash-merged ${chalk.bold(stackNodes.length.toString())} stacked PRs`);
    } else {
        logger.info(`🔀 Merging main repository PR ${chalk.gray(`#${mainPr.number}`)}...`);
        await mergePullRequestSquash(githubClient, githubConfig, mainPr.number);
        logger.info(`   ${chalk.green('✓')} Squash-merged main repository PR`);
    }

    // Never switch to the base branch: under git worktrees it is checked out in another one and the
    // checkout would fail. GitHub may have deleted the merged remote branches — that is fine, the
    // local ones survive, which is what lets the caller put the user back where they started.
    logger.info('');
    logger.info(`🎉 Merged task ${chalk.bold(issueId)} (squash), via the GitHub API.`);
}

/**
 * Order the task's open pull requests the way GitHub's stack record orders them.
 *
 * The `--sN` branch suffix is only a naming convention; the stack is the authority on what merges
 * into what, so the merge follows it. Returns `null` when the stack does not describe a chain of
 * this task's open PRs — merging then has no well-defined order.
 * @__NO_SIDE_EFFECTS__
 */
function orderNodes(mainPrs: PullRequest[], stack: PullRequestStack): PullRequest[] | null {
    const byNumber = new Map(mainPrs.map(pr => [pr.number, pr]));
    const ordered: PullRequest[] = [];

    for (const stacked of stack.pullRequests) {
        if (stacked.mergedAt || stacked.state === 'closed') {
            continue;
        }

        const pr = byNumber.get(stacked.number);
        if (!pr) {
            return null;
        }

        ordered.push(pr);
    }

    return ordered.length === mainPrs.length ? ordered : null;
}

/**
 * Parameters for {@link assertSubmodulesOnlyInBottomNode}.
 */
interface AssertSubmodulesOnlyInBottomNodeParams {
    branches: string[];
    submodulePaths: string[];
    logger: Logger;
}

/**
 * Refuse to merge when a node above the bottom moves a submodule pointer.
 *
 * Submodule pull requests merge once, before the stack, and the bottom node is then re-pointed at
 * the resulting squash commit. A node higher up that also moves the pointer would be squashed
 * against a base that already has the merged value, so its diff reads as moving the pointer *back* —
 * `main` would end up referencing a commit that no longer exists on the submodule's branch. Keeping
 * submodule work in the bottom node is what makes the whole chain safe, so it is checked rather
 * than documented and hoped for.
 */
async function assertSubmodulesOnlyInBottomNode(params: AssertSubmodulesOnlyInBottomNodeParams): Promise<void> {
    const { branches, submodulePaths, logger } = params;
    const git = simpleGit({ config: ['submodule.recurse=false'] });
    const offenders: string[] = [];

    for (let index = 1; index < branches.length; index++) {
        const parentBranch = branches[index - 1]!;
        const nodeBranch = branches[index]!;

        const changed = await git.raw([
            'diff',
            '--name-only',
            `${parentBranch}...${nodeBranch}`,
            '--',
            ...submodulePaths,
        ]);

        if (changed.trim()) {
            offenders.push(
                `   ${chalk.cyan(nodeBranch)} moves ${chalk.magenta(changed.trim().split('\n').join(', '))}`,
            );
        }
    }

    if (offenders.length === 0) {
        return;
    }

    logger.error('❌ Cannot merge — submodule changes must live in the bottom node of a stack:');
    for (const offender of offenders) {
        logger.error(offender);
    }

    throw new UsageError(
        'Move the submodule change down to the bottom node (and restack), or split it into its own task.',
    );
}

/**
 * Parameters for {@link waitForStackMerge}.
 */
interface WaitForStackMergeParams {
    githubClient: GithubClient;
    githubConfig: GithubConfig;
    prNumber: number;
    uuid: string;
    nodeCount: number;
    logger: Logger;

    /**
     * Delay between polls, in milliseconds.
     * @default 5000
     */
    intervalMs?: number;

    /**
     * Maximum time to wait before giving up, in milliseconds.
     * @default 1200000
     */
    timeoutMs?: number;
}

const DEFAULT_STACK_MERGE_INTERVAL_MS = 5_000;
const DEFAULT_STACK_MERGE_TIMEOUT_MS = 1_200_000;

/**
 * Poll an asynchronous stack merge until GitHub reports it landed, was queued, or failed.
 *
 * Bounded by a deadline: `pending` is a legitimate transient state, but it is also what a stack
 * blocked on a review that nobody leaves — or a status string this client does not model — reports
 * forever, and the status payload is untyped so neither is distinguishable at runtime. An
 * unattended `task merge --yes` must fail with a diagnosis rather than poll until someone kills it.
 */
async function waitForStackMerge(params: WaitForStackMergeParams): Promise<void> {
    const {
        githubClient,
        githubConfig,
        prNumber,
        uuid,
        nodeCount,
        logger,
        intervalMs = DEFAULT_STACK_MERGE_INTERVAL_MS,
        timeoutMs = DEFAULT_STACK_MERGE_TIMEOUT_MS,
    } = params;

    // The last status GitHub reported, so the deadline can name what it was stuck on.
    let lastStatus = 'pending';

    await withTimeout({
        timeoutMs,
        // Bounding the whole loop rather than checking elapsed time between iterations also covers a
        // GitHub request that stalls: an unresponsive API call can no longer hang the wait forever.
        operation: async signal => {
            while (!signal.aborted) {
                const { status, message } = await getMergeAsyncStatus(githubClient, githubConfig, prNumber, uuid);

                if (status === 'merged') {
                    return;
                }

                if (status === 'enqueued') {
                    logger.info(`   ${chalk.green('✓')} Stack enqueued in the merge queue — it will land there.`);
                    return;
                }

                if (status === 'failed') {
                    throw new UsageError(
                        `GitHub could not merge the stack of ${nodeCount} PRs: ${message ?? 'no reason given'}. ` +
                            'Nothing was merged — the stack merge is atomic.',
                    );
                }

                lastStatus = status;
                logger.info(`   Waiting for GitHub to land the stack (${status})...`);
                await waitFor(intervalMs);
            }
        },
        onTimeout: () => {
            throw new UsageError(
                `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for GitHub to land the stack of ` +
                    `${nodeCount} PRs via PR #${prNumber} (last reported status: ${lastStatus}). It may be ` +
                    'waiting on a required review or a merge queue that has not drained — nothing was merged.',
            );
        },
    });
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
 * Check out a stack's bottom node, so the local half of the merge happens where it belongs.
 *
 * The branch may have no local counterpart at all — `stackTask` creates node branches on the remote,
 * and a worktree only gains one when someone checks that node out — so it is resolved first.
 *
 * A branch checked out in another worktree of the same clone cannot be checked out here. Git says so
 * and says nothing about what to do, which is the difference between an error and an answer.
 */
async function checkoutBottomNode(branch: string, baseBranch: string, logger: Logger): Promise<void> {
    const git = simpleGit({ config: ['submodule.recurse=false'] });

    logger.info('');
    logger.info(`🔽 Moving to the stack's bottom node ${chalk.cyan(branch)}...`);

    await ensureLocalBranch(git, branch);

    try {
        await git.checkout(branch);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already checked out')) {
            throw error;
        }

        throw new UsageError(
            `The stack's bottom node ${chalk.cyan(branch)} is checked out in another worktree, and the merge ` +
                `has to run there — it merges ${chalk.cyan(baseBranch)} into that branch locally before any PR ` +
                `is touched. Run the merge from that worktree, or switch it to another branch first.`,
        );
    }
}

/**
 * Abort the merge if the main repository has uncommitted changes.
 *
 * The mirror of {@link assertSubmodulesClean}, for the repository the merge actually commits in.
 */
async function assertMainRepoClean(logger: Logger): Promise<void> {
    const git = simpleGit({ config: ['submodule.recurse=false'] });
    const status = await git.status();

    if (status.files.length === 0) {
        return;
    }

    logger.error('❌ Cannot merge — the main repository has uncommitted changes:');
    for (const file of status.files.slice(0, 10)) {
        logger.error(`   ${chalk.cyan(file.path)}`);
    }
    if (status.files.length > 10) {
        logger.error(`   ${chalk.gray(`…and ${status.files.length - 10} more`)}`);
    }

    throw new UsageError(
        'Commit, push or discard the changes and try again — the merge refreshes and restacks branches ' +
            'locally, and will not commit on your behalf.',
    );
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
    /**
     * Main-repository PRs to merge, bottom to top — one entry unless the task is a stack.
     */
    mainPrs: PullRequest[];
    submoduleTargets: SubmoduleTarget[];
    autoYes: boolean;
    logger: Logger;
}

/**
 * Log the merge plan — every PR with its state, clickable URL and unresolved-review-comment count —
 * and ask before landing any of it. Throws {@link UsageError} if the user declines.
 *
 * **It asks every time**, unless `autoYes`. An earlier version prompted only when some PR had
 * unresolved threads, which meant the ordinary case — a clean stack — merged several pull requests
 * into `main` with nobody asked. Merging is irreversible and outward-facing, and "nothing to inspect"
 * is not the same as "go ahead". `--yes` is how a caller says it has already decided.
 *
 * Answering yes also covers taking any draft out of draft, which is why nothing prompts per node
 * afterwards: the plan below names which PRs are drafts, so one answer is an informed one.
 */
async function confirmMerge(params: ConfirmMergeParams): Promise<void> {
    const { githubClient, mainConfig, mainPrs, submoduleTargets, autoYes, logger } = params;

    logger.info('');
    logger.info(chalk.bold('📋 The following PRs will be squash-merged (submodules first):'));

    let totalUnresolved = 0;
    let drafts = 0;

    for (const target of submoduleTargets) {
        if (target.openPr) {
            const unresolved = await countUnresolvedReviewThreads(githubClient, target.config, target.openPr.number);
            totalUnresolved += unresolved;
            drafts += target.openPr.draft ? 1 : 0;
            logger.info(
                `   ${chalk.magenta(target.name)} ${chalk.gray(`#${target.openPr.number}`)} ${target.openPr.title} ` +
                    formatState(target.openPr.draft) +
                    formatUnresolved(unresolved),
            );
            logger.info(`      ${chalk.blueBright(chalk.underline(target.openPr.html_url))}`);
        } else {
            logger.info(
                `   ${chalk.magenta(target.name)} ${chalk.gray('(PR already merged — will refresh reference)')}`,
            );
        }
    }

    for (const pr of mainPrs) {
        const unresolved = await countUnresolvedReviewThreads(githubClient, mainConfig, pr.number);
        totalUnresolved += unresolved;
        drafts += pr.draft ? 1 : 0;
        logger.info(
            `   ${chalk.cyan(mainConfig.repo)} ${chalk.gray(`#${pr.number}`)} ${pr.title} ` +
                formatState(pr.draft) +
                formatUnresolved(unresolved),
        );
        logger.info(`      ${chalk.blueBright(chalk.underline(pr.html_url))}`);
    }

    if (autoYes) {
        return;
    }

    const prCount = mainPrs.length + submoduleTargets.filter(target => target.openPr).length;
    const notes: string[] = [];
    if (totalUnresolved > 0) {
        notes.push(`${totalUnresolved} unresolved comment${totalUnresolved === 1 ? '' : 's'}`);
    }
    if (drafts > 0) {
        notes.push(`${drafts} draft${drafts === 1 ? '' : 's'} to convert`);
    }

    logger.info('');
    const { proceed } = await enquirer.prompt<{ proceed: boolean }>({
        type: 'confirm',
        name: 'proceed',
        message:
            `Squash-merge ${prCount === 1 ? 'this pull request' : `all ${prCount} pull requests`}` +
            `${notes.length > 0 ? ` (${notes.join(', ')})` : ''}?`,
    });

    if (!proceed) {
        logger.info('Aborted — no PRs were merged.');
        throw new UsageError('Merge cancelled by user.');
    }
}

/**
 * Format a pull request's draft state for the confirmation summary. Only drafts are called out —
 * "ready" is the expected state and saying so on every line buys nothing.
 * @__NO_SIDE_EFFECTS__
 */
function formatState(isDraft: boolean | null | undefined): string {
    return isDraft ? chalk.yellow('(draft) ') : '';
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
