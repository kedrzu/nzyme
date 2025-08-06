import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';
import enquirer from 'enquirer';

import type { Logger } from '@nzyme/logging';

/**
 * Handle task assignment logic - assign to current user if unassigned, or ask user if reassign.
 * @__NO_SIDE_EFFECTS__
 */
export async function handleTaskAssignment(
    linearClient: LinearClient,
    issueData: Awaited<ReturnType<typeof linearClient.issue>>,
    logger: Logger,
): Promise<void> {
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
            // Task is assigned to someone else - ask if reassign
            const { shouldReassign } = await enquirer.prompt<{ shouldReassign: boolean }>({
                type: 'confirm',
                name: 'shouldReassign',
                message: `Task is assigned to ${chalk.yellow(assignee.displayName)}. Reassign to ${chalk.green(currentUser.displayName)}?`,
                initial: false,
            });

            if (shouldReassign) {
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
        logger.warn(`⚠️  Failed to handle task assignment: ${(error as Error).message}`);
    }
}
