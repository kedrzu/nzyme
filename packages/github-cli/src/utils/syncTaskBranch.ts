import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkoutSubmodules } from './checkoutSubmodules.js';
import type { GithubClient } from './createGithubClient.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import { syncAllRepos } from './syncAllRepos.js';

/**
 * Parameters for {@link syncTaskBranch}.
 */
export interface SyncTaskBranchParams {
    /**
     * The task branch the main repository has just been put on — see `SyncAllReposParams.branch`.
     */
    branch: string;

    /**
     * The base of the branch's pull request — see `SyncAllReposParams.baseBranch`.
     */
    baseBranch: string;

    /**
     * What the submodules follow — see `resolveSubmoduleBase`.
     */
    submoduleBase: SubmoduleBase;

    /**
     * Whether nobody can be asked a question — see `decideUnattendedMode`.
     */
    unattended: boolean;

    /**
     * GitHub client of the main repository.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Bring a task branch the main repository has just been put on — an existing pull request's, or a
 * new one's — in line with what its pull request lands on: check each submodule out where the
 * branch's gitlink resolves (`checkoutSubmodules`), then run the `task refresh` sync
 * (`syncAllRepos`). Following the trunk, that leaves every clean submodule resting on the trunk at
 * the tip of its `origin` trunk, with the moved gitlink committed and pushed, so the pull request is
 * tested against the latest submodules; pinned, every submodule stays on the commit its gitlink
 * records.
 *
 * Commits every pending change of the main repository (see `syncAllRepos`), so a caller holding the
 * user's changes aside re-applies them only once this has returned or thrown.
 */
export async function syncTaskBranch(params: SyncTaskBranchParams): Promise<void> {
    const { branch, baseBranch, submoduleBase, unattended, githubClient, githubConfig, logger } = params;

    await checkoutSubmodules({ githubClient, githubConfig, submoduleBase, logger, unattended });

    logger.info(`🔄 Synchronizing with PR base branch ${chalk.cyan(baseBranch)}`);
    await syncAllRepos({ branch, baseBranch, submoduleBase, unattended, githubClient, githubConfig, logger });
}
