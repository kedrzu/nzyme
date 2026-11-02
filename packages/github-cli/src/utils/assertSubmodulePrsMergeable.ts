import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import type { GithubClient } from './createGithubClient.js';
import type { RefreshedSubmodulePr } from './refreshSubmoduleChain.js';

const DEFAULT_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Parameters for {@link assertSubmodulePrsMergeable}.
 */
export interface AssertSubmodulePrsMergeableParams {
    /**
     * GitHub client; each pull request is read from its own submodule's repository.
     */
    githubClient: GithubClient;

    /**
     * The submodule pull requests a refresh brought up to date, with the head it left on each.
     */
    prs: RefreshedSubmodulePr[];

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Delay between polls while GitHub has not caught up yet.
     * @default 3000
     */
    intervalMs?: number;

    /**
     * How long to wait for GitHub to report every pull request's mergeability.
     * @default 60000
     */
    timeoutMs?: number;
}

/**
 * Refuse to call a refresh done while GitHub cannot merge one of the submodule pull requests.
 *
 * A refresh that brought every branch up to date can still leave a pull request GitHub will not
 * merge — a stack node GitHub replays onto the trunk can conflict where a plain merge into its base
 * does not — and saying "everything OK" over that is how a conflicting submodule PR went unnoticed.
 *
 * GitHub computes mergeability asynchronously and its pull request object lags a push, so an answer
 * counts only once the pull request reports the head this refresh left on it; until then, and while
 * `mergeable` is still `null`, it is polled. An answer that never arrives is a failure too, not a
 * pass: an unconfirmed pull request is not known to be mergeable.
 * @throws {UsageError} Naming every pull request GitHub reports as conflicting or never confirmed.
 */
export async function assertSubmodulePrsMergeable(params: AssertSubmodulePrsMergeableParams): Promise<void> {
    const { githubClient, prs, logger, intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

    if (prs.length === 0) {
        return;
    }

    logger.info('');
    logger.info(chalk.bold('🔎 Checking the submodule pull requests are mergeable...'));

    const conflicting: RefreshedSubmodulePr[] = [];
    // A PR is settled the moment it is classified, not at the end of its round: the deadline can
    // fire mid-round, and the report must then show what GitHub last said about each PR.
    const settled = new Set<RefreshedSubmodulePr>();
    const unsettled = () => prs.filter(pr => !settled.has(pr));

    // Bounding the whole poll rather than checking the clock between rounds also covers a GitHub
    // request that stalls: an unresponsive API call can no longer hang the check past its deadline.
    await waitUntil(
        async () => {
            for (const pr of unsettled()) {
                const { data } = await githubClient.rest.pulls.get({
                    owner: pr.githubConfig.owner,
                    repo: pr.githubConfig.repo,
                    pull_number: pr.number,
                });

                if (data.head.sha !== pr.headSha || data.mergeable === null) {
                    continue;
                }

                settled.add(pr);
                if (!data.mergeable || data.mergeable_state === 'dirty') {
                    conflicting.push(pr);
                } else {
                    logger.info(`   ${chalk.green('✓')} ${describePr(pr)} is mergeable`);
                }
            }

            return settled.size === prs.length;
        },
        { intervalMs, timeoutMs, onTimeout: () => {} },
    );

    const unconfirmed = unsettled();
    if (conflicting.length === 0 && unconfirmed.length === 0) {
        return;
    }

    const problems = [
        ...conflicting.map(pr => `${describePr(pr)} has conflicts GitHub will not merge`),
        ...unconfirmed.map(
            pr => `${describePr(pr)}: GitHub did not confirm it is mergeable within ${Math.round(timeoutMs / 1000)}s`,
        ),
    ];

    throw new UsageError(
        `Submodule pull requests are not mergeable:\n` +
            problems.map(problem => `  - ${problem}`).join('\n') +
            `\nResolve a conflict on the node it names (merge the node below, or the trunk into the bottom node), push, and re-run. ` +
            `A PR GitHub did not confirm needs only a re-run.`,
    );
}

function describePr(pr: RefreshedSubmodulePr): string {
    return `${pr.submoduleName} PR #${pr.number} (${pr.headRef})`;
}
