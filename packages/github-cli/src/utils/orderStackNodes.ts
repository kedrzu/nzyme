import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';

import type { GitHubPR } from './findMatchingPr.js';
import type { PullRequestStack } from './stacksApi.js';

/**
 * Parameters for {@link orderStackNodes}.
 */
export interface OrderStackNodesParams {
    /** The task's open pull requests, in any order. */
    prs: GitHubPR[];
    /** GitHub's stack record for one of them, or `null` when there is none. */
    stack: PullRequestStack | null;
    /** Task identifier, for the error message. */
    issueId: string;
    /**
     * One sentence on why this command needs the order, inserted before the remedy. Omit it where
     * the command's own name already says it.
     */
    reason?: string;
}

/**
 * Order a task's open pull requests the way GitHub's stack record orders them, bottom to top.
 *
 * The `--sN` branch suffix is only a naming convention; the stack is the authority on what builds on
 * what, so every command that walks a chain follows it. Returns `null` for a lone pull request with
 * no stack behind it — an ordinary unstacked task — and refuses for several, because both commands
 * that ask push what they merge, and a guessed order pushes one pull request's diff into another.
 */
export function orderStackNodes(params: OrderStackNodesParams): GitHubPR[] | null {
    const { prs, stack, issueId, reason } = params;

    const ordered = stack ? orderNodes(prs, stack) : null;
    if (ordered) {
        return ordered;
    }

    if (prs.length <= 1) {
        return null;
    }

    const list = prs.map(pr => `  #${pr.number} ${pr.head.ref}`).join('\n');

    throw new UsageError(
        `Task ${chalk.bold(issueId)} has ${prs.length} open pull requests that are not a stack:\n${list}\n` +
            `${reason ? `${reason} ` : ''}Stack them (\`task stack\`) or close the ones that should not merge.`,
    );
}

/**
 * Walk the stack record and pick out this task's open pull requests in its order.
 *
 * Returns `null` when the stack does not describe a chain of exactly these pull requests — a stack
 * that has moved on, or pull requests belonging to more than one of them.
 * @__NO_SIDE_EFFECTS__
 */
function orderNodes(prs: GitHubPR[], stack: PullRequestStack): GitHubPR[] | null {
    const byNumber = new Map(prs.map(pr => [pr.number, pr]));
    const ordered: GitHubPR[] = [];

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

    return ordered.length === prs.length ? ordered : null;
}
