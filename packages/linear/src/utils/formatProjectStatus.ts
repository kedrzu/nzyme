import chalk from 'chalk';

/**
 * Format project status with colors and emphasis for better visual clarity.
 * @param state The project state to format
 * @returns Formatted string with appropriate colors and styling
 * @__NO_SIDE_EFFECTS__
 */
export function formatProjectStatus(state: string): string {
    const normalizedState = state.toLowerCase();

    switch (normalizedState) {
        case 'active':
        case 'in_progress':
        case 'in progress':
        case 'started':
            return chalk.green.bold(`(${state})`);

        case 'archived':
        case 'blocked':
        case 'canceled':
        case 'cancelled':
            return chalk.red.bold(`(${state})`);

        case 'backlog':
            return chalk.gray.bold(`(${state})`);

        case 'completed':
        case 'current':
        case 'done':
        case 'finished':
            return chalk.blue.bold(`(${state})`);

        case 'not_started':
        case 'not started':
        case 'planned':
            return chalk.cyan.bold(`(${state})`);

        case 'on_hold':
        case 'on hold':
        case 'paused':
            return chalk.yellow.bold(`(${state})`);

        default:
            // For unknown states, use cyan to make them stand out
            return chalk.cyan(`(${state})`);
    }
}
