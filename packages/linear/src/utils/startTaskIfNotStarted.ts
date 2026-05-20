import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import { findInProgressState } from './findInProgressState.js';

/**
 * Move a Linear task to "In Progress" when starting work on it.
 *
 * No-ops if the task is already started, or in a terminal state (those are
 * handled upstream by `handleTerminalState`, which prompts the user).
 * Failures are logged as warnings — assignment/branch work should still proceed.
 */
export async function startTaskIfNotStarted(
    issueData: Awaited<ReturnType<LinearClient['issue']>>,
    logger: Logger,
): Promise<void> {
    if (!issueData) {
        return;
    }

    try {
        const currentState = await issueData.state;

        if (!currentState) {
            return;
        }

        // Skip states that don't need an automatic transition:
        // - started: already in progress / in review
        // - completed / canceled: terminal, handled by handleTerminalState (prompts user)
        if (currentState.type === 'started' || currentState.type === 'completed' || currentState.type === 'canceled') {
            return;
        }

        const team = await issueData.team;

        if (!team) {
            return;
        }

        const inProgressState = await findInProgressState(team);

        if (!inProgressState) {
            logger.warn('⚠️  Could not find "In Progress" state in the team workflow');
            return;
        }

        logger.info(
            `🔄 Moving task from "${chalk.yellow(currentState.name)}" to "${chalk.green(inProgressState.name)}"...`,
        );

        await issueData.update({
            stateId: inProgressState.id,
        });

        logger.info(`✅ Task state changed to "${chalk.green(inProgressState.name)}"`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`⚠️  Failed to move task to "In Progress": ${message}`);
    }
}
