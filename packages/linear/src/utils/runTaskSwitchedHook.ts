import type { TaskSwitchedHook } from '../cli/TaskSwitchedHook.js';
import type { TaskSwitchedInfo } from '../cli/TaskSwitchedInfo.js';

/**
 * Run the task-switched hook, if one is configured.
 * The hook is a side effect of an already completed switch,
 * so a failing hook only warns and never fails the command.
 */
export async function runTaskSwitchedHook(hook: TaskSwitchedHook | undefined, task: TaskSwitchedInfo) {
    if (!hook) {
        return;
    }

    try {
        await hook(task);
    } catch (error) {
        task.logger.warn(`⚠️  Task switched hook failed for ${task.issueId}`, { error });
    }
}
