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
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 1_200_000;

/**
 * Check-run conclusions that count as a hard failure.
 */
const FAILING_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'stale']);

/**
 * Block until a pull request's required checks have passed, then return.
 *
 * `mergeable_state` is the primary gate (it already reflects branch-protection / required checks),
 * which avoids needing branch-protection admin scope to enumerate "required" checks:
 * - `clean` / `unstable` → mergeable, return (GitHub permits merging `unstable`, where only
 *   non-required checks are failing/pending).
 * - `dirty` → conflicts with base, abort.
 * - `behind` → head is behind base, abort with a `task refresh` hint.
 * - `blocked` with a failed check-run/commit status → a required check failed, abort.
 * - `blocked` / `unknown` / pending otherwise → keep polling until the timeout.
 *
 * The PR is re-fetched every iteration so a push that changes the head SHA (e.g. the post-submodule
 * refresh commit) is observed rather than raced. The subsequent merge call remains the authoritative
 * gate for anything `mergeable_state` cannot express (e.g. a missing required review).
 */
export async function waitForRequiredChecks(params: WaitForRequiredChecksParams): Promise<void> {
    const {
        client,
        config,
        prNumber,
        logger,
        intervalMs = DEFAULT_INTERVAL_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS,
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

        if (mergeableState === 'dirty') {
            throw new UsageError(`PR #${prNumber} has conflicts with its base branch — resolve them and try again.`);
        }

        if (mergeableState === 'behind') {
            throw new UsageError(`PR #${prNumber} is behind its base branch — run \`task refresh\` and try again.`);
        }

        if (mergeableState === 'clean' || mergeableState === 'unstable') {
            logger.info(`   ${chalk.green('✓')} Checks passed for PR ${chalk.gray(`#${prNumber}`)}`);
            return;
        }

        // blocked / unknown / pending: surface a hard required-check failure immediately, otherwise wait.
        const failedChecks = await getFailedChecks(client, config, headSha);
        if (mergeableState === 'blocked' && failedChecks.length > 0) {
            throw new UsageError(`PR #${prNumber} has failing required checks: ${failedChecks.join(', ')}`);
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
 * Collect the names of failed check-runs and failing commit statuses for a ref.
 */
async function getFailedChecks(client: GithubClient, config: GithubConfig, ref: string): Promise<string[]> {
    const failed: string[] = [];

    const { data: checks } = await client.rest.checks.listForRef({
        owner: config.owner,
        repo: config.repo,
        ref,
    });

    for (const run of checks.check_runs) {
        if (run.status === 'completed' && run.conclusion && FAILING_CONCLUSIONS.has(run.conclusion)) {
            failed.push(run.name);
        }
    }

    const { data: combined } = await client.rest.repos.getCombinedStatusForRef({
        owner: config.owner,
        repo: config.repo,
        ref,
    });

    if (combined.state === 'failure' || combined.state === 'error') {
        for (const status of combined.statuses) {
            if (status.state === 'failure' || status.state === 'error') {
                failed.push(status.context);
            }
        }
        if (failed.length === 0) {
            failed.push('commit status');
        }
    }

    return failed;
}
