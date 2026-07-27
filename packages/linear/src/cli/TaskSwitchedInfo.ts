import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Details of the task the CLI has just switched to.
 */
export interface TaskSwitchedInfo {
    /**
     * The Linear issue ID (e.g., "SIG-123").
     */
    issueId: string;

    /**
     * The Linear issue title, as stored in Linear.
     */
    title: string;

    /**
     * Logger of the command that performed the switch.
     */
    logger: Logger;
}
