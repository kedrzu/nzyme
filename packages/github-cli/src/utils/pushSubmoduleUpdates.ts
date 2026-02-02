import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for pushing submodule updates.
 */
export interface PushSubmoduleUpdatesParams {
    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Optional list of specific submodule paths to commit.
     * If provided, only these paths will be staged and committed.
     * If not provided, the function will detect changed submodules automatically.
     */
    submodulePaths?: string[];
}

/**
 * Result of pushing submodule updates.
 */
export interface PushSubmoduleUpdatesResult {
    /**
     * Whether a commit was created.
     */
    committed: boolean;

    /**
     * Whether changes were pushed.
     */
    pushed: boolean;
}

/**
 * Stage, commit ("Submodule update"), and push any changed submodule references.
 * Only commits the specified submodule paths (or detected changes if not specified).
 */
export async function pushSubmoduleUpdates(params: PushSubmoduleUpdatesParams): Promise<PushSubmoduleUpdatesResult> {
    const { logger, submodulePaths } = params;
    const git = simpleGit();

    let pathsToCommit: string[];

    if (submodulePaths && submodulePaths.length > 0) {
        // Use the provided paths - check which ones actually have changes vs HEAD
        const changedPaths: string[] = [];
        for (const path of submodulePaths) {
            try {
                // Check if this submodule has changes compared to HEAD
                const diff = await git.diff(['--name-only', 'HEAD', '--', path]);
                if (diff.trim()) {
                    changedPaths.push(path);
                }
            } catch {
                // If diff fails, assume there might be changes
                changedPaths.push(path);
            }
        }
        pathsToCommit = changedPaths;
    } else {
        // Detect changed submodules by comparing working tree to HEAD
        // This avoids the issue with git submodule status comparing to index
        const submoduleList = await git.raw(['submodule', 'foreach', '--quiet', 'echo $sm_path']);
        const allSubmodulePaths = submoduleList.trim().split('\n').filter(Boolean);

        const changedPaths: string[] = [];
        for (const path of allSubmodulePaths) {
            try {
                const diff = await git.diff(['--name-only', 'HEAD', '--', path]);
                if (diff.trim()) {
                    changedPaths.push(path);
                }
            } catch {
                // If diff fails, skip this submodule
            }
        }
        pathsToCommit = changedPaths;
    }

    if (pathsToCommit.length === 0) {
        logger.info('✅ No submodule reference changes to commit');
        return { committed: false, pushed: false };
    }

    logger.info(`📝 Found ${chalk.yellow(pathsToCommit.length.toString())} submodule(s) with updated references`);

    // Stage only the specific submodule paths
    for (const submodulePath of pathsToCommit) {
        logger.info(`   📦 Staging ${chalk.magenta(submodulePath)}`);
        await git.add(submodulePath);
    }

    // Commit only the staged submodule paths using `--` to specify paths
    // This ensures we only commit the submodules, not any other staged changes
    logger.info('💾 Committing submodule updates...');
    await git.raw(['commit', '-m', 'Submodule update', '--', ...pathsToCommit]);
    logger.info('✅ Committed submodule updates');

    // Push (handles case where no upstream is configured)
    logger.info('📤 Pushing submodule update commit...');
    await pushWithUpstream(git);
    logger.info('✅ Pushed to remote');

    return { committed: true, pushed: true };
}
