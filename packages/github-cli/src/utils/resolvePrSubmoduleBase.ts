import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import type { GitHubPR } from './findMatchingPr.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import { resolveSubmoduleBase } from './resolveSubmoduleBase.js';
import { findStackForPr } from './stacksApi.js';

/**
 * Parameters for {@link resolvePrSubmoduleBase}.
 */
export interface ResolvePrSubmoduleBaseParams {
    /**
     * GitHub client of the main repository.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository.
     */
    githubConfig: GithubConfig;

    /**
     * The product pull request the command acts on, or `null` when the branch has none yet — then
     * nothing says it lands anywhere but the trunk, and its submodules follow the trunk.
     */
    pr: GitHubPR | null;

    /**
     * See `ResolveSubmoduleBaseParams.trunk`.
     */
    trunk: string;
}

/**
 * Look up where a product pull request finally lands and decide from it what its submodules follow
 * — see `resolveSubmoduleBase`.
 *
 * An upper node of a stack is based on the node below it, so its own `base.ref` says nothing about
 * where it lands; GitHub's stack record does. A pull request in no stack lands on its `base.ref`.
 */
export async function resolvePrSubmoduleBase(params: ResolvePrSubmoduleBaseParams): Promise<SubmoduleBase> {
    const { githubClient, githubConfig, pr, trunk } = params;

    if (!pr) {
        return resolveSubmoduleBase({ landingTrunk: trunk, trunk });
    }

    const stack = await findStackForPr(githubClient, githubConfig, pr.number);

    return resolveSubmoduleBase({ landingTrunk: stack?.base ?? pr.base.ref, trunk });
}
