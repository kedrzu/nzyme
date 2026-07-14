import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { waitFor } from '@nzyme/utils/waitFor.js';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * Parameters for {@link waitForRequiredChecks}.
 */
export interface WaitForRequiredChecksParams {
    /**
     * GitHub client.
     */
    client: GithubClient;

    /**
     * GitHub configuration for the repository owning the PR.
     */
    config: GithubConfig;

    /**
     * The pull request number to gate on.
     */
    prNumber: number;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Delay between polls, in milliseconds.
     * @default 10000
     */
    intervalMs?: number;

    /**
     * Maximum time to wait before giving up, in milliseconds.
     * @default 1200000
     */
    timeoutMs?: number;

    /**
     * The head commit SHA the checks must belong to (the commit we just pushed).
     *
     * GitHub's PR object lags behind a push: `pulls.get` keeps reporting the previous head SHA for
     * a short window, and that stale commit still carries the previous commit's checks (e.g. an
     * "all submodules merged" required check that failed before the submodules were merged). When
     * set, the gate ignores the PR until `head.sha` matches this value, so a stale commit's failures
     * are never mistaken for failures of the commit we actually want to merge. Omit it (e.g. for
     * submodule PRs that are not freshly pushed in this flow) to evaluate whatever head SHA the PR
     * currently reports.
     */
    expectedHeadSha?: string;
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 1_200_000;

/**
 * Check-run conclusions that count as a hard failure.
 */
const FAILING_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'stale']);

/**
 * The aggregate state of every check run and commit status on a head SHA.
 */
interface ChecksState {
    /**
     * Names of failed check runs / commit statuses (failing conclusion or `failure`/`error` state).
     */
    failed: string[];

    /**
     * Whether any check run / commit status is still pending or in progress.
     */
    pending: boolean;

    /**
     * Total number of check runs + commit statuses observed for the head SHA.
     */
    total: number;
}

/**
 * Block until a pull request's checks have all passed, then return.
 *
 * The gate is driven by the actual check runs and commit statuses on the head SHA (not by
 * `mergeable_state` alone), so it never lets a merge proceed while a check is failing or still
 * pending — including non-required checks that `mergeable_state === 'unstable'` would otherwise wave
 * through. This avoids needing branch-protection admin scope to enumerate "required" checks.
 *
 * On every poll iteration, after the conflict/refresh aborts below, all check runs
 * ({@link GithubClient.rest.checks.listForRef}) and commit statuses
 * ({@link GithubClient.rest.repos.getCombinedStatusForRef}) for the head SHA are enumerated, then:
 * - If ANY check/status has a failing conclusion/state → abort immediately, naming the failed checks.
 * - Else if ANY check/status is still pending/in progress → keep polling (do not proceed).
 * - Else (all present checks completed and none failing) → success, return.
 *
 * `mergeable_state` short-circuits only for states unrelated to checks:
 * - `dirty` → conflicts with base, abort.
 * - `behind` → head is behind base, abort with a `task refresh` hint.
 *
 * Edge case — no checks at all: a head SHA may legitimately have zero check runs and zero commit
 * statuses (e.g. a repo with no CI). To avoid hanging until the timeout, `mergeable_state === 'clean'`
 * is treated as the signal that there is genuinely nothing pending, so the gate passes. Any other
 * `mergeable_state` with no checks reported keeps polling (the checks may not have registered yet).
 * This no-CI escape is suppressed when {@link WaitForRequiredChecksParams.expectedHeadSha} is set:
 * a commit we just pushed is expected to run CI, so the gate waits for at least one check to appear
 * rather than passing in the gap after the head SHA flips but before the new checks register.
 *
 * The PR is re-fetched every iteration so a push that changes the head SHA (e.g. the post-submodule
 * refresh commit) is observed rather than raced. When `expectedHeadSha` is set, iterations whose
 * head SHA does not yet match it are skipped entirely (no check evaluation) until GitHub catches up
 * or the timeout is hit. A timeout reached while still pending — or still waiting for the head SHA
 * to match — throws.
 */
export async function waitForRequiredChecks(params: WaitForRequiredChecksParams): Promise<void> {
    const {
        client,
        config,
        prNumber,
        logger,
        intervalMs = DEFAULT_INTERVAL_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        expectedHeadSha,
    } = params;

    const deadline = Date.now() + timeoutMs;

    for (;;) {
        const { data: pr } = await client.rest.pulls.get({
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
        });

        const mergeableState = pr.mergeable_state;
        const headSha = pr.head.sha;

        // Gate on the just-pushed commit: until GitHub reports it as the head, the PR still carries
        // the previous commit's checks, so do not evaluate (or fail on) them — keep polling.
        if (expectedHeadSha && headSha !== expectedHeadSha) {
            if (Date.now() >= deadline) {
                throw new UsageError(
                    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for PR #${prNumber} to register the ` +
                        `latest commit (expected ${expectedHeadSha.slice(0, 7)}, GitHub still reports ` +
                        `${headSha.slice(0, 7)}).`,
                );
            }
            logger.info(
                `   ⏳ Waiting for GitHub to register the latest commit on PR ${chalk.gray(`#${prNumber}`)}...`,
            );
            await waitFor(intervalMs);
            continue;
        }

        if (mergeableState === 'dirty') {
            throw new UsageError(`PR #${prNumber} has conflicts with its base branch — resolve them and try again.`);
        }

        if (mergeableState === 'behind') {
            throw new UsageError(`PR #${prNumber} is behind its base branch — run \`task refresh\` and try again.`);
        }

        const checks = await getChecksState(client, config, headSha);

        // Any failed check is a hard stop, regardless of mergeable_state.
        if (checks.failed.length > 0) {
            throw new UsageError(`PR #${prNumber} has failing checks: ${checks.failed.join(', ')}`);
        }

        // No failures: pass only when nothing is pending. With no checks reported, `clean` means
        // there is genuinely nothing to wait for (e.g. a repo with no CI); anything else keeps polling.
        // For a freshly-pushed commit (expectedHeadSha set) CI is expected, so suppress that escape
        // hatch and wait for at least one check to appear before passing.
        const noCiClean = mergeableState === 'clean' && !expectedHeadSha;
        const allChecksSettled = !checks.pending && (checks.total > 0 || noCiClean);
        if (allChecksSettled) {
            logger.info(`   ${chalk.green('✓')} Checks passed for PR ${chalk.gray(`#${prNumber}`)}`);
            return;
        }

        if (Date.now() >= deadline) {
            throw new UsageError(
                `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for PR #${prNumber} checks ` +
                    `(mergeable_state: ${mergeableState ?? 'unknown'}). It may be waiting on a required review.`,
            );
        }

        logger.info(`   ⏳ Waiting for checks on PR ${chalk.gray(`#${prNumber}`)} (${mergeableState ?? 'unknown'})...`);
        await waitFor(intervalMs);
    }
}

/**
 * Enumerate every check run and commit status on a ref, collecting failures and whether any are
 * still pending. This is the gate: a merge may proceed only when nothing is failing and nothing is
 * pending.
 */
async function getChecksState(client: GithubClient, config: GithubConfig, ref: string): Promise<ChecksState> {
    const failed: string[] = [];
    let pending = false;
    let total = 0;

    const { data: checks } = await client.rest.checks.listForRef({
        owner: config.owner,
        repo: config.repo,
        ref,
    });

    for (const run of checks.check_runs) {
        total++;
        if (run.status !== 'completed') {
            pending = true;
        } else if (run.conclusion && FAILING_CONCLUSIONS.has(run.conclusion)) {
            failed.push(run.name);
        }
    }

    const { data: combined } = await client.rest.repos.getCombinedStatusForRef({
        owner: config.owner,
        repo: config.repo,
        ref,
    });

    for (const status of combined.statuses) {
        total++;
        if (status.state === 'failure' || status.state === 'error') {
            failed.push(status.context);
        } else if (status.state === 'pending') {
            pending = true;
        }
    }

    return { failed, pending, total };
}
