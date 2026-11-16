import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli-core';

import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { isOnAnyRemoteBranch } from './parkSubmoduleOnBase.js';
import { readGitlink } from './readGitlink.js';

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
 * same. A rejected push never creates or moves a remote-tracking ref, so a plain fetch is enough
 * for that ref to stop vouching for the commit.
 * @throws {UsageError} When the pinned commit is on no remote branch — the message names the
 * submodule, the pinned commit and the remedy.
 */
export async function assertSubmodulePinPublished(params: AssertSubmodulePinPublishedParams): Promise<void> {
    const { mainGit, submodule } = params;
    const subGit = simpleGit({ baseDir: submodule.path });

    const pin = await readGitlink(mainGit, submodule.path);
    await subGit.fetch(['origin']);

    if (await isOnAnyRemoteBranch(subGit, pin)) {
        return;
    }

    throw new UsageError(
        `The main repository pins ${submodule.name} at ${pin.slice(0, 12)}, which is on no branch of ${submodule.name}'s remote. ` +
            `Push that commit to a branch in ${submodule.name}, or re-point the gitlink at a published commit.`,
    );
}
