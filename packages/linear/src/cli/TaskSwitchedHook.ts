import type { TaskSwitchedInfo } from './TaskSwitchedInfo.js';

/**
 * Called after the CLI has successfully switched to a task,
 * so the host project can react to it (e.g. rename its workspace).
 * Runs for its side effects only - failures never fail the command.
 */
export type TaskSwitchedHook = (task: TaskSwitchedInfo) => Promise<void> | void;
