import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';
import enquirer from 'enquirer';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Parameters for handling task assignment.
 */
export interface HandleTaskAssignmentParams {
    /**
     * Linear client instance.
     */
    linearClient: LinearClient;

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
     * When set, an issue somebody else owns keeps its owner instead of prompting.
     */
    unattended?: boolean;
}

/**
 * Handle task assignment logic - assign to current user if unassigned, or ask user if reassign.
 * @__NO_SIDE_EFFECTS__
 */
export async function handleTaskAssignment(params: HandleTaskAssignmentParams): Promise<void> {
    const { linearClient, issueData, logger, unattended } = params;

    if (!issueData) {
        return;
    }

    try {
        // Get current user and assignee information in parallel
        const [currentUser, assignee] = await Promise.all([linearClient.viewer, issueData.assignee]);

        if (!assignee) {
            // Task is unassigned - assign to current user
            logger.info(`🔄 Task is unassigned. Assigning to ${chalk.green(currentUser.displayName)}`);

            await issueData.update({
                assigneeId: currentUser.id,
            });

            logger.info(`✅ Task assigned to ${chalk.green(currentUser.displayName)}`);
        } else if (assignee.id !== currentUser.id) {
            if (unattended) {
                // Delegation deliberately leaves the human as the assignee, so this is not an
                // ownership conflict to resolve - it is the normal shape of a delegated issue.
                logger.info(`✅ Task stays assigned to ${chalk.yellow(assignee.displayName)}`);
                return;
            }

            assertCanAsk(assignee.displayName);

            // Task is assigned to someone else - ask if reassign
            const { assignmentAction } = await enquirer.prompt<{ assignmentAction: string }>({
                type: 'select',
                name: 'assignmentAction',
                message: `Task is assigned to ${chalk.yellow(assignee.displayName)}. What would you like to do?`,
                choices: [
                    {
                        name: 'keep',
                        message: `${chalk.yellow('Keep current assignee')} (${assignee.displayName})`,
                        value: 'keep',
                    },
                    {
                        name: 'reassign',
                        message: `${chalk.green('Reassign to me')} (${currentUser.displayName})`,
                        value: 'reassign',
                    },
                ],
            });

            if (assignmentAction === 'reassign') {
                await issueData.update({
                    assigneeId: currentUser.id,
                });

                logger.info(
                    `✅ Task reassigned from ${chalk.yellow(assignee.displayName)} to ${chalk.green(currentUser.displayName)}`,
                );
            } else {
                logger.info(`📝 Task remains assigned to ${chalk.yellow(assignee.displayName)}`);
            }
        } else {
            // Task is already assigned to current user
            logger.info(`✅ Task is already assigned to ${chalk.green(currentUser.displayName)}`);
        }
    } catch (error) {
        if (error instanceof UsageError) {
            throw error;
        }

        logger.warn(`⚠️  Failed to handle task assignment: ${(error as Error).message}`);
    }
}

/**
 * Fail with a diagnosis rather than hang when there is no terminal to ask in.
 *
 * Reached by an agent that is not the issue's delegate: it has no answer to give and enquirer waits
 * forever rather than defaulting, so the run would stall until somebody killed it.
 */
function assertCanAsk(assigneeName: string): void {
    if (process.stdin.isTTY) {
        return;
    }

    throw new UsageError(
        `This task is assigned to ${assigneeName}, and there is no terminal to ask whether to take it over. ` +
            `Run it yourself, or have the issue delegated to the agent this process runs as.`,
    );
}
