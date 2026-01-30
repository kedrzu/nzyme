import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

/**
 * Parameters for pushing submodule updates.
 */
export interface PushSubmoduleUpdatesParams {
    /**
     * Logger instance.
     */
    logger: Logger;
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
 */
export async function pushSubmoduleUpdates(params: PushSubmoduleUpdatesParams): Promise<PushSubmoduleUpdatesResult> {
    const { logger } = params;
    const git = simpleGit();

    // Check if there are submodule reference changes using `git submodule status`
    // Lines starting with '+' indicate the submodule is at a different commit than recorded
    const submoduleStatus = await git.raw(['submodule', 'status']);
    const changedSubmodules = submoduleStatus
        .split('\n')
        .filter(line => line.startsWith('+'))
        .map(line => {
            // Format: +<sha> <path> (<branch info>)
            const match = line.match(/^\+\S+\s+(\S+)/);
            return match ? match[1] : null;
        })
        .filter((path): path is string => path !== null);

    if (changedSubmodules.length === 0) {
        logger.info('✅ No submodule reference changes to commit');
        return { committed: false, pushed: false };
    }

    logger.info(`📝 Found ${chalk.yellow(changedSubmodules.length.toString())} submodule(s) with updated references`);

    // Stage all changed submodules
    for (const submodulePath of changedSubmodules) {
        logger.info(`   📦 Staging ${chalk.magenta(submodulePath)}`);
        await git.add(submodulePath);
    }

    // Commit with "Submodule update" message
    logger.info('💾 Committing submodule updates...');
    await git.commit('Submodule update');
    logger.info('✅ Committed submodule updates');

    // Push
    logger.info('📤 Pushing submodule update commit...');
    await git.push();
    logger.info('✅ Pushed to remote');

    return { committed: true, pushed: true };
}
