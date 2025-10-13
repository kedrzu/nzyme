export { defineLinearCommands } from './cli/defineLinearCommands.js';
export type { LinearCommandsOptions, LinearConfig } from './cli/defineLinearCommands.js';
export { createLinearIssue } from './utils/createLinearIssue.js';
export type { CreateLinearIssueParams } from './utils/createLinearIssue.js';
export { extractTaskIdFromBranch } from './utils/extractTaskIdFromBranch.js';
export { getNonCompleteProjects } from './utils/getProjects.js';
export type { ProjectInfo } from './utils/getProjects.js';
export { switchToTask } from './utils/switchToTask.js';
export type { SwitchToTaskParams } from './utils/switchToTask.js';

// Re-export GitHub utilities from the shared package
export type { GithubConfig } from '@nzyme/github-cli';
export { createIssueIdRegex, getCurrentBranch } from '@nzyme/github-cli';
