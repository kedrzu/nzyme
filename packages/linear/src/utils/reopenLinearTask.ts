import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import { findInProgressState } from './findInProgressState.js';

/**
 * Reopen a Linear task by changing its state to "In Progress" or similar.
 */
export async function reopenLinearTask(linearClient: LinearClient, issueId: string, logger: Logger): Promise<void> {
    logger.info(`🔄 Reopening Linear task ${chalk.bold(issueId)}...`);

    const issueData = await linearClient.issue(issueId);

    if (!issueData) {
        throw new UsageError(`Linear task ${issueId} not found`);
    }

    // Get the team to find the "In Progress" state
    const team = await issueData.team;

    if (!team) {
        throw new UsageError('Could not find team for this issue');
    }

    const inProgressState = await findInProgressState(team);

    if (!inProgressState) {
        throw new UsageError('Could not find "In Progress" state in the team workflow');
    }

    // Update the issue state
    await issueData.update({
        stateId: inProgressState.id,
    });

    logger.info(`✅ Task ${chalk.bold(issueId)} reopened with state "${chalk.green(inProgressState.name)}"`);
}
