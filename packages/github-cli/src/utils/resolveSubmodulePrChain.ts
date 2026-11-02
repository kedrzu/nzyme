import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { findOpenPrForBranch } from './findMatchingPr.js';
import { findStackForPr } from './stacksApi.js';

/**
 * One open pull request of a submodule's chain.
 */
export interface SubmodulePrChainNode {
    number: number;
    headRef: string;
}

/**
 * Parameters for {@link resolveSubmodulePrChain}.
 */
export interface ResolveSubmodulePrChainParams {
    /**
     * GitHub client used for the lookups.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the submodule's OWN repository.
     */
    githubConfig: GithubConfig;

    /**
     * Display name of the submodule, used in refusals.
     */
    submoduleName: string;

    /**
     * The submodule's checked-out branch, which has an open pull request of its own.
     */
    branch: string;

    /**
     * The trunk the submodules follow. The chain has to land there.
     */
    trunk: string;
}

/**
 * Find the open pull requests a submodule branch builds on, ordered bottom to top, so the trunk
 * can be merged into the bottom one and carried up rather than merged straight into the branch.
 *
 * GitHub's stack record answers first, and then the chain is every open node of that stack,
 * including nodes above `branch`. Without a record, the chain is followed down through each pull
 * request's base until the trunk. Nothing records what sits above `branch` then, so nothing above
 * it is included. A lone pull request on the trunk is a chain of one.
 * @throws {UsageError} When `branch` has no open pull request, or when the chain does not land on
 * the trunk: a stack based elsewhere, or a base that is neither the trunk nor an open PR's branch.
 * Taking the trunk into such a chain would put commits there that its own landing branch never had.
 */
export async function resolveSubmodulePrChain(params: ResolveSubmodulePrChainParams): Promise<SubmodulePrChainNode[]> {
    const { githubClient, githubConfig, submoduleName, branch, trunk } = params;

    const pr = await findOpenPrForBranch(githubClient, githubConfig, branch);
    if (!pr) {
        throw new UsageError(
            `${submoduleName} is on ${branch}, which has no open pull request. Open a pull request for ${branch} in ${submoduleName}.`,
        );
    }

    const stack = await findStackForPr(githubClient, githubConfig, pr.number);
    if (stack) {
        if (stack.base !== trunk) {
            throw new UsageError(
                `${submoduleName}'s PR #${pr.number} is in stack #${stack.number}, which lands on ${stack.base}, not ${trunk}. ` +
                    `Re-target the stack onto ${trunk} in ${submoduleName}, or move the submodule off ${branch}.`,
            );
        }

        return stack.pullRequests
            .filter(node => node.state === 'open' && !node.mergedAt)
            .map(node => ({ number: node.number, headRef: node.headRef }));
    }

    const chain: SubmodulePrChainNode[] = [{ number: pr.number, headRef: pr.head.ref }];
    // A base already in the chain is a cycle of re-targeted PRs; it is refused like any other base
    // that does not lead to the trunk.
    const visited = new Set([pr.head.ref]);
    let base = pr.base.ref;
    let top = pr.number;

    while (base !== trunk) {
        const below = visited.has(base) ? null : await findOpenPrForBranch(githubClient, githubConfig, base);

        if (!below) {
            throw new UsageError(
                `${submoduleName}'s PR #${top} targets ${base}, which is neither ${trunk} nor the branch of another open pull request. ` +
                    `Re-target PR #${top} onto ${trunk} or onto the open pull request it builds on.`,
            );
        }

        chain.unshift({ number: below.number, headRef: below.head.ref });
        visited.add(below.head.ref);
        base = below.base.ref;
        top = below.number;
    }

    return chain;
}
