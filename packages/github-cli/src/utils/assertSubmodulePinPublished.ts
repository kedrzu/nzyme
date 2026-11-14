import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli-core';

import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { isOnAnyRemoteBranch } from './parkSubmoduleOnBase.js';
import { parseContainingBranches } from './resolveSubmoduleBranch.js';

/**
 * Parameters for {@link assertSubmodulePinPublished}.
 */
export interface AssertSubmodulePinPublishedParams {
    /**
     * Git instance of the main repository, whose `HEAD` records the gitlink being checked.
     */
    mainGit: SimpleGit;

    /**
     * The submodule whose gitlink is checked.
     */
    submodule: SubmoduleInfo;
}

/**
 * Refuse when the commit the main repository's `HEAD` pins `submodule` at is on no branch of the
 * submodule's remote — pushing the main repository then would publish a gitlink nobody else can
 * check out.
 *
 * This is the one part of the readiness check that still applies when the submodules stay on their
 * pin (see `PinnedSubmoduleBase`): the pin is never moved there, but the pin the branch already
 * records — by a hand-made commit, or one taken in from its base — has to be published all the
 * same. The submodule is fetched with `--prune` first, which moves only its remote-tracking refs: a
 * stale ref would otherwise vouch for a commit whose push was rejected or whose branch was deleted.
 * @throws {UsageError} When the pinned commit is on no remote branch — the message names the
 * submodule, the local branch carrying the commit, and the remedy.
 */
export async function assertSubmodulePinPublished(params: AssertSubmodulePinPublishedParams): Promise<void> {
    const { mainGit, submodule } = params;
    const subGit = simpleGit({ baseDir: submodule.path });

    const pin = (await mainGit.raw(['rev-parse', `HEAD:${submodule.path}`])).trim();
    await subGit.fetch(['origin', '--prune']);

    if (await isOnAnyRemoteBranch(subGit, pin)) {
        return;
    }

    const localBranches = await findLocalBranchesContaining(subGit, pin);
    const shortPin = pin.slice(0, 12);

    if (localBranches.length === 0) {
        throw new UsageError(
            `The main repository pins ${submodule.name} at ${shortPin}, which is on no branch of ${submodule.name}'s remote. ` +
                `Push that commit to a branch in ${submodule.name}, or re-point the gitlink at a published commit.`,
        );
    }

    const branches = localBranches.join(', ');
    throw new UsageError(
        `The main repository pins ${submodule.name} at ${shortPin}, which is on ${branches} locally but on no branch of ${submodule.name}'s remote. ` +
            `Push ${branches} in ${submodule.name} (rebase it first if the push is rejected), then re-point the gitlink at the pushed commit.`,
    );
}

async function findLocalBranchesContaining(git: SimpleGit, sha: string): Promise<string[]> {
    try {
        return parseContainingBranches(await git.raw(['branch', '--format=%(refname:short)', '--contains', sha]));
    } catch {
        // The commit is not even in this checkout's object store, so no branch here carries it.
        return [];
    }
}
