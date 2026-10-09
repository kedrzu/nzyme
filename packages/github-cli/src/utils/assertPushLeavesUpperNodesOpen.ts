import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import { countCommits } from './countCommits.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * A branch stacked on the one about to be pushed, and the revision its pull request's head is at.
 */
export interface UpperNodeHead {
    /**
     * The upper node's branch name.
     */
    branch: string;

    /**
     * Its head — a SHA as GitHub reports it, or a ref such as `origin/<branch>`.
     */
    head: string;
}

/**
 * Parameters for {@link assertPushLeavesUpperNodesOpen}.
 */
export interface AssertPushLeavesUpperNodesOpenParams {
    /**
     * Git instance of the repository the push happens in.
     */
    git: SimpleGit;

    /**
     * The local branch about to be pushed to `origin/<branch>`.
     */
    branch: string;

    /**
     * The nodes stacked directly on {@link branch}. A node further up builds on these, so its head
     * cannot become reachable without theirs becoming reachable first.
     */
    upperNodes: UpperNodeHead[];
}

/**
 * Refuse a push that would carry an upper stack node's work into the node below it.
 *
 * GitHub marks a pull request merged — then closes it and deletes its branch — the moment its head
 * becomes reachable from its base. So pushing a node that has taken in the head of the node stacked
 * on it silently "merges" that node, and the stack is left with a merged node between open ones.
 * Work flows up a stack, never down; this is the last point at which a regression of that rule can
 * still be stopped before GitHub acts on it.
 *
 * A head that the remote branch already contains is not this push's doing and is let through.
 * @param params The repository, the branch being pushed and the nodes stacked on it.
 */
export async function assertPushLeavesUpperNodesOpen(params: AssertPushLeavesUpperNodesOpenParams): Promise<void> {
    const { git, branch, upperNodes } = params;

    for (const upper of upperNodes) {
        if (!(await containsRevision(git, branch, upper.head))) {
            continue;
        }

        if (await containsRevision(git, `origin/${branch}`, upper.head)) {
            continue;
        }

        throw new UsageError(
            `Refusing to push ${branch}: it now contains the head of ${upper.branch}, which is stacked on it. ` +
                `GitHub would read ${upper.branch}'s pull request as merged, close it and delete its branch. ` +
                `Nothing was pushed — undo whatever merged ${upper.branch} into ${branch} before pushing it.`,
        );
    }
}

/**
 * The open pull requests stacked directly on `branch`, as {@link UpperNodeHead}s.
 * @param githubClient GitHub client.
 * @param githubConfig GitHub configuration of the repository `branch` lives in.
 * @param branch The branch whose upper nodes to look up.
 * @returns One entry per open pull request whose base is `branch`.
 */
export async function findUpperNodeHeads(
    githubClient: GithubClient,
    githubConfig: GithubConfig,
    branch: string,
): Promise<UpperNodeHead[]> {
    const { data } = await githubClient.rest.pulls.list({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        state: 'open',
        base: branch,
        per_page: 100,
    });

    return data.map(pr => ({ branch: pr.head.ref, head: pr.head.sha }));
}

/**
 * Whether `revision` is reachable from `ref`. A revision this clone does not have — a head GitHub
 * knows about but nobody fetched here — cannot be part of any local branch, so it reads as `false`.
 */
async function containsRevision(git: SimpleGit, ref: string, revision: string): Promise<boolean> {
    try {
        return (await countCommits(git, `${ref}..${revision}`)) === 0;
    } catch {
        return false;
    }
}
