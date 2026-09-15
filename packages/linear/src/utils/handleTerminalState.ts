import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';
import enquirer from 'enquirer';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import { findInProgressState } from './findInProgressState.js';

/**
 * Parameters for handling a task in a terminal state.
 */
export interface HandleTerminalStateParams {
    /**
     * The Linear issue data.
     */
    issueData: Awaited<ReturnType<LinearClient['issue']>>;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Whether nobody is available to answer a question.
     * When set, a closed task is refused rather than reopened.
     */
    unattended?: boolean;
}

/**
 * Handle terminal state logic - ask user if they want to change state to "In Progress".
 * @param params Parameters for handling a task in a terminal state.
 * @returns Promise that resolves when handling is complete
 * @throws Error if user cancels or if state change fails
 */
export async function handleTerminalState(params: HandleTerminalStateParams): Promise<void> {
    const { issueData, logger, unattended } = params;

    if (!issueData) {
        return;
    }

    try {
        // Get the current state
        const currentState = await issueData.state;

        if (!currentState || !isTerminalState(currentState.name)) {
            // Not in terminal state, proceed normally
            return;
        }

        logger.info(`⚠️  Task is in terminal state: ${chalk.yellow(currentState.name)}`);

        assertStartable(issueData.identifier, currentState.name, unattended);

        // Ask user what to do
        const { action } = await enquirer.prompt<{ action: string }>({
            type: 'select',
            name: 'action',
            message: `Task ${chalk.bold(issueData.identifier)} is in terminal state "${chalk.yellow(currentState.name)}". What would you like to do?`,
            choices: [
                {
                    name: 'proceed',
                    message: chalk.green('Change status to "In Progress" and proceed'),
                    value: 'proceed',
                },
                {
                    name: 'cancel',
                    message: chalk.red('Cancel and do not switch to this task'),
                    value: 'cancel',
                },
            ],
        });

        if (action === 'cancel') {
            throw new UsageError('Task switching cancelled by user');
        }

        // Find the "In Progress" state for this team
        logger.info('🔍 Looking for "In Progress" state...');
        const team = await issueData.team;

        if (!team) {
            throw new UsageError('Could not find team for this issue');
        }

        const inProgressState = await findInProgressState(team);

        if (!inProgressState) {
            throw new UsageError('Could not find "In Progress" state in the team workflow');
        }

        logger.info(
            `🔄 Changing task state from "${chalk.yellow(currentState.name)}" to "${chalk.green(inProgressState.name)}"...`,
        );

        // Update the issue state
        await issueData.update({
            stateId: inProgressState.id,
        });

        logger.info(`✅ Task state changed to "${chalk.green(inProgressState.name)}"`);
    } catch (error) {
        if (error instanceof UsageError) {
            throw error;
        }

        logger.warn(`⚠️  Failed to handle terminal state: ${(error as Error).message}`);
        throw error;
    }
}

/**
 * Refuse a closed task that nobody can be asked about, saying what to do instead.
 *
 * Delegated, this is a deliberate boundary rather than a missing answer: `delegate` is an ordinary
 * field that survives an issue being closed, so a closed-and-delegated issue is leftover state, not
 * a request. Reopening one is a human's decision, expressed by moving it back to `Todo` — which is
 * also the only signal an agent acts on.
 *
 * Not delegated, it is the ordinary no-terminal case: the question is real, there is just nobody to
 * put it to, and hanging on it until someone kills the process helps no one.
 */
function assertStartable(identifier: string, stateName: string, unattended: boolean | undefined): void {
    if (unattended) {
        throw new UsageError(
            `Task ${identifier} is ${stateName} and will not be started automatically. ` +
                `Move it to Todo if the work should happen.`,
        );
    }

    if (!process.stdin.isTTY) {
        throw new UsageError(
            `Task ${identifier} is ${stateName}, and there is no terminal to ask whether to reopen it. ` +
                `Move it to Todo first, or run the command yourself.`,
        );
    }
}

/**
 * Check if a state name represents a terminal state that should not be worked on.
 * @param stateName The state name to check
 * @returns True if the state is terminal
 * @__NO_SIDE_EFFECTS__
 */
function isTerminalState(stateName: string): boolean {
    const normalizedState = stateName.toLowerCase();
    const terminalStates = [
        'done',
        'completed',
        'canceled',
        'cancelled',
        'duplicate',
        'archived',
        'rejected',
        'closed',
        'finished',
    ];

    return terminalStates.includes(normalizedState);
}
