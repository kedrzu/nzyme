import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { findUpperNodeHeads } from './assertPushLeavesUpperNodesOpen.js';
import { createBranchGuard } from './createBranchGuard.js';
import type { GithubClient } from './createGithubClient.js';
import { createGithubClient } from './createGithubClient.js';
import type { GitHubPR } from './findMatchingPr.js';
import { resolveNodePr } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import { handlePushPreparation } from './handlePushPreparation.js';
import { resolvePrSubmoduleBase } from './resolvePrSubmoduleBase.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import { syncAllRepos } from './syncAllRepos.js';

/**
 * Parameters for pushing changes.
 */
export interface PushChangesParams {
    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID.
     */
    issueId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * The project's trunk (e.g. 'main'): what the main repository syncs with when the branch has no
     * pull request yet, and the only branch submodules ever follow — see `resolveSubmoduleBase`.
     */
    baseBranch: string;

    /**
     * Whether nobody can be asked a question — see `decideUnattendedMode`. Until this parameter
     * existed the push path hardcoded "do not prompt", which meant a person pushing from a
     * terminal got the same silent auto-commits an agent does.
     */
    unattended: boolean;

    /**
     * Default commit message to use when committing changes.
     */
    defaultCommitMessage?: string;
}

/**
 * Result of pushing changes.
 */
export interface PushChangesResult {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * The matching PR, if found.
     */
    pr: GitHubPR | null;

    /**
     * What the submodules followed in this push, for the steps after it (taking submodule pull
     * requests out of draft) to act on the same decision.
     */
    submoduleBase: SubmoduleBase;
}

/**
 * Push changes: sync all repos, find matching PR, and handle push preparation.
 * Shared logic used by both push and ready commands.
 */
export async function pushChanges(params: PushChangesParams): Promise<PushChangesResult> {
    const { githubConfig, issueId, logger, baseBranch, unattended, defaultCommitMessage } = params;

    // Create GitHub client
    const githubClient = createGithubClient(githubConfig);

    // Resolve the PR before syncing, because the PR is what says which branch this one sits on.
    // Resolved against the current branch so that on a stacked task this is the node being pushed,
    // not some other node of the same task.
    const currentBranch = await getCurrentBranch();
    const pr = await resolveNodePr(githubClient, githubConfig, issueId, currentBranch);
    const prInReview = pr ? !pr.draft : false;

    // Sync against the branch this PR actually targets — the parent node for a stacked task, and the
    // trunk for everything else (including every unstacked task, where it is the same `main` as
    // before). Merging the trunk straight into an upper node would make the trunk's commits read as
    // that node's own work, since its diff is measured against the node below it.
    const syncBaseBranch = pr?.base.ref ?? baseBranch;

    // The submodules follow the trunk only when the whole PR (or its stack) lands there — an upper
    // node's base is its parent node, which says nothing about where it lands.
    const submoduleBase = await resolvePrSubmoduleBase({ githubClient, githubConfig, pr, trunk: baseBranch });

    // Sync all repos: commit the main repo, judge the submodules, fetch, rebase/pull, fast-forward base.
    // Pinned to `currentBranch`, the branch `syncBaseBranch` was derived from, so a checkout by another
    // command during the lookup above stops the sync instead of pairing this base with another node.
    await syncAllRepos({
        branch: currentBranch,
        baseBranch: syncBaseBranch,
        submoduleBase,
        unattended,
        githubClient,
        githubConfig,
        logger,
        defaultCommitMessage,
    });

    // Deliberately `submoduleBase`, never `syncBaseBranch`: this flows into the submodule PR base
    // (ensureRepositoryReady). A submodule's branch is its own repository's, so it never carries a
    // node suffix and never targets a node branch; passing `syncBaseBranch` here would, for the
    // second stack node, point a submodule's pull request at a branch of the main repository that
    // its own remote does not even have.
    await handlePushPreparation({
        githubClient,
        githubConfig,
        issueId,
        logger,
        submoduleBase,
        unattended,
        prInReview,
        defaultCommitMessage,
        guard: createBranchGuard({
            git: simpleGit(),
            branch: currentBranch,
            findUpperNodes: () => findUpperNodeHeads(githubClient, githubConfig, currentBranch),
        }),
    });

    return { githubClient, pr, submoduleBase };
}
