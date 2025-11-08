import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import type { GithubClient } from './createGithubClient.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import { handleReadyPreparation } from './handleReadyPreparation.js';
import { handleSubmoduleReadyPreparation } from './handleSubmoduleReadyPreparation.js';

/**
 * Parameters for handling push preparation.
 */
export interface HandlePushPreparationParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

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
     * Base branch for submodules.
     */
    baseBranch: string;

    /**
     * Whether to skip submodule processing.
     */
    skipSubmodules?: boolean;

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;
}

/**
 * Handle the preparation phase for pushing changes.
 * This includes handling submodule changes and main repository changes.
 * Does NOT convert PR to ready - only prepares changes.
 */
export async function handlePushPreparation(params: HandlePushPreparationParams): Promise<void> {
    const { githubClient, githubConfig, issueId, logger, baseBranch, skipSubmodules, autoYes } = params;

    // FIRST: Handle submodule changes (submodules must be processed before main repo)
    await handleSubmoduleReadyPreparation({
        githubClient,
        githubConfig,
        issueId,
        logger,
        baseBranch,
        skipSubmodules,
        autoYes,
    });

    // SECOND: Handle main repository changes (including submodule reference updates)
    logger.info('🔍 Checking main repository status...');
    const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(), getGitStatusInfo()]);

    await handleReadyPreparation(unpushedCommits, statusInfo, logger, autoYes);
}
