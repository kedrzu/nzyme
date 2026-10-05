import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { waitFor } from '@nzyme/utils/waitFor.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * One pull request gated by {@link waitForRequiredChecks}.
 */
export interface RequiredChecksPr {
    /**
     * The pull request number.
     */
    number: number;

    /**
     * Shown next to the number in progress lines and errors (e.g. a stack node's branch), so a
     * failure names which pull request of several it belongs to.
     */
    label?: string;

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

/**
 * Parameters for {@link waitForRequiredChecks}.
 */
export interface WaitForRequiredChecksParams {
    /**
     * GitHub client.
     */
    client: GithubClient;

    /**
     * GitHub configuration for the repository owning the PRs.
     */
    config: GithubConfig;

    /**
     * The pull requests to gate on — every one of them has to pass.
     */
    prs: RequiredChecksPr[];

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
     * Failed check runs / commit statuses (failing conclusion or `failure`/`error` state), each
     * described as its name plus a link to its run when GitHub reports one.
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
 * Outcome of one poll of a single pull request.
 */
type PrChecksProgress = { passed: true } | { passed: false; state: string; waitingOn: string };

/**
 * Block until every given pull request's checks have all passed, then return.
 *
 * All pull requests are polled together on every iteration rather than one after another, so a
 * failure anywhere aborts as soon as it is reported — a stack whose third node is red must not first
 * wait out the bottom node's CI to say so — and the wait for the whole set is as long as its slowest
 * member, not the sum. A pull request that has passed is not polled again.
 *
 * The gate is driven by the actual check runs and commit statuses on each head SHA (not by
 * `mergeable_state` alone), so it never lets a merge proceed while a check is failing or still
 * pending — including non-required checks that `mergeable_state === 'unstable'` would otherwise wave
 * through. This avoids needing branch-protection admin scope to enumerate "required" checks.
 *
 * For each pull request, after the conflict/refresh aborts below, all current check runs
 * ({@link GithubClient.rest.checks.listForRef}, minus the superseded ones — see
 * {@link dropSupersededCheckRuns}) and commit statuses
 * ({@link GithubClient.rest.repos.getCombinedStatusForRef}) for the head SHA are enumerated, then:
 * - If ANY check/status has a failing conclusion/state → abort immediately, naming the pull request
 *   and the failed checks with links to their runs.
 * - Else if ANY check/status is still pending/in progress → keep polling (do not proceed).
 * - Else (all present checks completed and none failing) → that pull request has passed.
 *
 * `mergeable_state` short-circuits only for states unrelated to checks:
 * - `dirty` → conflicts with base, abort.
 * - `behind` → head is behind base, abort with a `task refresh` hint.
 *
 * Edge case — no checks at all: a head SHA may legitimately have zero check runs and zero commit
 * statuses (e.g. a repo with no CI). To avoid hanging until the timeout, `mergeable_state === 'clean'`
 * is treated as the signal that there is genuinely nothing pending, so the gate passes. Any other
 * `mergeable_state` with no checks reported keeps polling (the checks may not have registered yet).
 * This no-CI escape is suppressed when {@link RequiredChecksPr.expectedHeadSha} is set: a commit we
 * just pushed is expected to run CI, so the gate waits for at least one check to appear rather than
 * passing in the gap after the head SHA flips but before the new checks register.
 *
 * Each PR is re-fetched every iteration so a push that changes the head SHA (e.g. the post-submodule
 * refresh commit) is observed rather than raced. When `expectedHeadSha` is set, iterations whose
 * head SHA does not yet match it are skipped for that PR (no check evaluation) until GitHub catches
 * up or the timeout is hit. A timeout reached while anything is still pending — or still waiting for
 * a head SHA to match — throws, naming what each unfinished PR was waiting on.
 */
export async function waitForRequiredChecks(params: WaitForRequiredChecksParams): Promise<void> {
    const { client, config, prs, logger, intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

    // What each unfinished PR was last waiting on, phrased for the timeout. Kept up to date on every
    // poll, so the deadline can explain itself from outside the loop.
    const waitingOn = new Map<number, string>(
        prs.map(pr => [pr.number, `${describePr(pr)} checks (mergeable_state: unknown)`]),
    );

    await withTimeout({
        timeoutMs,
        // Bounding the whole loop rather than checking `Date.now()` between iterations also covers a
        // GitHub request that stalls: an unresponsive API call can no longer hang the gate forever.
        operation: async signal => {
            while (!signal.aborted) {
                const states: string[] = [];

                for (const pr of prs) {
                    if (!waitingOn.has(pr.number)) {
                        continue;
                    }

                    const progress = await pollPrChecks(client, config, pr);
                    if (progress.passed) {
                        waitingOn.delete(pr.number);
                        logger.info(`   ${chalk.green('✓')} Checks passed for ${describePr(pr)}`);
                        continue;
                    }

                    waitingOn.set(pr.number, progress.waitingOn);
                    states.push(`${chalk.gray(`#${pr.number}`)} (${progress.state})`);
                }

                if (waitingOn.size === 0) {
                    return;
                }

                logger.info(`   ⏳ Waiting for checks on ${states.join(', ')}...`);
                await waitFor(intervalMs);
            }
        },
        onTimeout: () => {
            throw new UsageError(
                `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ` +
                    `${[...waitingOn.values()].join('; ')}. It may be waiting on a required review.`,
            );
        },
    });
}

/**
 * Poll one pull request once: throw on a conflict, a stale base or a failing check, otherwise say
 * whether it has passed or what it is still waiting on.
 */
async function pollPrChecks(
    client: GithubClient,
    config: GithubConfig,
    pr: RequiredChecksPr,
): Promise<PrChecksProgress> {
    const { expectedHeadSha } = pr;
    const { data } = await client.rest.pulls.get({
        owner: config.owner,
        repo: config.repo,
        pull_number: pr.number,
    });

    const mergeableState = data.mergeable_state ?? 'unknown';
    const headSha = data.head.sha;

    // Gate on the just-pushed commit: until GitHub reports it as the head, the PR still carries the
    // previous commit's checks, so do not evaluate (or fail on) them — keep polling.
    if (expectedHeadSha && headSha !== expectedHeadSha) {
        return {
            passed: false,
            state: 'registering the latest commit',
            waitingOn:
                `${describePr(pr)} to register the latest commit (expected ` +
                `${expectedHeadSha.slice(0, 7)}, GitHub still reports ${headSha.slice(0, 7)})`,
        };
    }

    if (mergeableState === 'dirty') {
        throw new UsageError(`${describePr(pr)} has conflicts with its base branch — resolve them and try again.`);
    }

    if (mergeableState === 'behind') {
        throw new UsageError(`${describePr(pr)} is behind its base branch — run \`task refresh\` and try again.`);
    }

    const checks = await getChecksState(client, config, headSha);

    // Any failed check is a hard stop, regardless of mergeable_state.
    if (checks.failed.length > 0) {
        throw new UsageError(
            `${describePr(pr)} has failing checks:\n${checks.failed.map(check => `   ${check}`).join('\n')}`,
        );
    }

    // No failures: pass only when nothing is pending. With no checks reported, `clean` means there is
    // genuinely nothing to wait for (e.g. a repo with no CI); anything else keeps polling. For a
    // freshly-pushed commit (expectedHeadSha set) CI is expected, so suppress that escape hatch and
    // wait for at least one check to appear before passing.
    const noCiClean = mergeableState === 'clean' && !expectedHeadSha;
    if (!checks.pending && (checks.total > 0 || noCiClean)) {
        return { passed: true };
    }

    return {
        passed: false,
        state: mergeableState,
        waitingOn: `${describePr(pr)} checks (mergeable_state: ${mergeableState})`,
    };
}

/**
 * Name a gated pull request for progress lines and errors: its number, plus its label when it has one.
 * @__NO_SIDE_EFFECTS__
 */
function describePr(pr: RequiredChecksPr): string {
    return pr.label ? `PR #${pr.number} (${pr.label})` : `PR #${pr.number}`;
}

/**
 * Enumerate every current check run and commit status on a ref, collecting failures and whether any
 * are still pending. This is the gate: a merge may proceed only when nothing is failing and nothing
 * is pending.
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

    for (const run of dropSupersededCheckRuns(checks.check_runs)) {
        total++;
        if (run.status !== 'completed') {
            pending = true;
        } else if (run.conclusion && FAILING_CONCLUSIONS.has(run.conclusion)) {
            failed.push(describeCheck(run.name, run.details_url ?? run.html_url));
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
            failed.push(describeCheck(status.context, status.target_url));
        } else if (status.state === 'pending') {
            pending = true;
        }
    }

    return { failed, pending, total };
}

/**
 * Describe a failed check as its name plus, when GitHub reports one, the link to its run — the
 * failure's log is one click away instead of a search through the pull request's checks tab.
 * @__NO_SIDE_EFFECTS__
 */
function describeCheck(name: string, url: string | null | undefined): string {
    return url ? `${name} — ${url}` : name;
}

/**
 * Drop the check runs a newer run of the same name has already replaced on this SHA.
 *
 * One commit can carry several runs of the same workflow: a second `pull_request` event — such as
 * the `ready_for_review` this gate's own caller triggers by un-drafting the PR — starts a fresh run,
 * and a `concurrency` group with `cancel-in-progress` cancels the first. Both check runs stay
 * attached to that SHA forever, so the cancelled one reads as a failing `Build` sitting next to the
 * green `Build` that replaced it, and the gate refuses a PR whose checks actually passed. GitHub's
 * own `filter=latest` does not cover this: it de-duplicates within a check suite, and the two runs
 * are in different suites.
 *
 * Suites are kept or dropped whole rather than picking the newest run per name, so a matrix job
 * emitting several same-named runs in one suite survives intact. Suite ids grow over time, so the
 * highest id carrying a given name is that name's current suite. A run with no suite cannot be
 * superseded and is always kept.
 */
function dropSupersededCheckRuns<T extends { name: string; check_suite?: { id: number } | null }>(runs: T[]): T[] {
    const currentSuiteByName = new Map<string, number>();

    for (const run of runs) {
        const suiteId = run.check_suite?.id;
        if (suiteId === undefined) {
            continue;
        }

        const currentSuiteId = currentSuiteByName.get(run.name);
        if (currentSuiteId === undefined || suiteId > currentSuiteId) {
            currentSuiteByName.set(run.name, suiteId);
        }
    }

    return runs.filter(run => {
        const suiteId = run.check_suite?.id;
        return suiteId === undefined || currentSuiteByName.get(run.name) === suiteId;
    });
}
