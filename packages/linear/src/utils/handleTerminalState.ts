import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';
import enquirer from 'enquirer';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Handle terminal state logic - ask user if they want to change state to "In Progress".
 * @param linearClient Linear client instance
 * @param issueData The Linear issue data
 * @param logger Logger instance
 * @returns Promise that resolves when handling is complete
 * @throws Error if user cancels or if state change fails
 */
export async function handleTerminalState(
    issueData: Awaited<ReturnType<LinearClient['issue']>>,
    logger: Logger,
): Promise<void> {
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

        // Ask user what to do
        const { action } = await enquirer.prompt<{ action: string }>({
            type: 'select',
            name: 'action',
            message: `Task ${chalk.bold(issueData.identifier)} is in terminal state "${chalk.yellow(currentState.name)}". What would you like to do?`,
            choices: [
                {
                    name: 'proceed',
                    message: `${chalk.green('Change status to "In Progress" and proceed')}`,
                    value: 'proceed',
                },
                {
                    name: 'cancel',
                    message: `${chalk.red('Cancel and do not switch to this task')}`,
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

        const workflowStates = await team.states();

        const inProgressState = workflowStates.nodes.find(
            state =>
                state.name.toLowerCase() === 'in progress' ||
                state.name.toLowerCase() === 'inprogress' ||
                state.type === 'started',
        );

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
