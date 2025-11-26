import chalk from 'chalk';
import enquirer from 'enquirer';
import open from 'open';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import {
    convertAllPrsToReady,
    createGithubClient,
    findMatchingPr,
    getCurrentBranch,
    handlePushPreparation,
    openPrInBrowser,
    syncBaseBranch,
} from '@nzyme/github-cli';
import type { GithubConfig } from '@nzyme/github-cli';

import { createLinearClient } from '../utils/createLinearClient.js';
import { createLinearIssue } from '../utils/createLinearIssue.js';
import { extractTaskIdFromBranch } from '../utils/extractTaskIdFromBranch.js';
import { formatProjectStatus } from '../utils/formatProjectStatus.js';
import { getNonCompleteProjects } from '../utils/getProjects.js';
import { parseTaskIdentifier } from '../utils/parseTaskIdentifier.js';
import { switchToTask } from '../utils/switchToTask.js';

/**
 * Configuration for Linear API access.
 */
export interface LinearConfig {
    /**
     * Linear API token.
     */
    apiToken: string;

    /**
     * Default team prefix (e.g., 'SIG' for SIG-123).
     */
    defaultPrefix?: string;
}

/**
 * Options for the Linear commands.
 */
export interface LinearCommandsOptions {
    /**
     * Linear configuration.
     */
    linear: (() => LinearConfig) | (() => Promise<LinearConfig>) | LinearConfig;

    /**
     * GitHub configuration.
     */
    github: (() => GithubConfig) | (() => Promise<GithubConfig>) | GithubConfig;

    /**
     * The prefix to use for commands.
     */
    prefix?: string;

    /**
     * The function to call before each command.
     */
    beforeEach?: () => Promise<void>;

    /**
     * The base branch(es) to use when creating new branches.
     * Can be a string (e.g., 'main'), an array of strings (e.g., ['main', 'develop']),
     * or a function that returns the base branch name(s).
     * If not provided, defaults to the current branch.
     */
    baseBranch?:
        | (() => Promise<string>)
        | (() => Promise<string[]>)
        | (() => string)
        | (() => string[])
        | string
        | string[];
}

/**
 * Define the Linear commands.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearCommands(options: LinearCommandsOptions): CommandClass[] {
    return [
        //
        defineTaskInfoCommand(options),
        defineTaskStartCommand(options),
        defineTaskNewCommand(options),
        defineTaskPushCommand(options),
        defineTaskReadyCommand(options),
        defineTaskRefreshCommand(options),
        defineTaskListCommand(options),
        defineTaskOpenCommand(options),
        defineTaskPrCommand(options),
    ];
}

function defineTaskInfoCommand(options: LinearCommandsOptions) {
    return class TaskInfoCommand extends Command {
        static override paths = getCommandPaths(options);
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Display information about the current task',
            details:
                'Detects the task from the current branch and displays comprehensive information including task name, URLs, and associated PR',
            examples: [['Show current task information', 'task info']],
        });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGithubConfig(options),
            ]);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create clients in parallel
                const [linearClient, githubClient] = await Promise.all([
                    Promise.resolve(createLinearClient(linearConfig)),
                    Promise.resolve(createGithubClient(githubConfig)),
                ]);

                // Get task details and search for PR in parallel
                this.logger.info('🔍 Fetching task details and searching for associated PR...');
                const [issueData, pr] = await Promise.all([
                    linearClient.issue(taskId),
                    findMatchingPr(githubClient, githubConfig, taskId),
                ]);

                if (!issueData) {
                    throw new UsageError(`Linear task ${chalk.bold(taskId)} not found`);
                }

                // Display task information
                this.logger.info('');
                this.logger.info(chalk.bold.blue('📋 Task Information'));
                this.logger.info('═'.repeat(50));
                this.logger.info(`📝 Task ID: ${chalk.bold(taskId)}`);
                this.logger.info(`📝 Task Name: ${chalk.green(issueData.title)}`);
                this.logger.info(`🔗 Task URL: ${chalk.underline(issueData.url)}`);
                this.logger.info(`🌿 Branch Name: ${chalk.cyan(currentBranch)}`);

                if (pr) {
                    this.logger.info(`📎 PR: ${chalk.blue(pr.title)} ${chalk.gray(`(#${pr.number})`)}`);
                    this.logger.info(`📎 PR URL: ${chalk.blueBright(chalk.underline(pr.html_url))}`);
                    this.logger.info(
                        `📊 PR Status: ${pr.draft ? chalk.yellow('Draft') : chalk.green('Ready for review')}`,
                    );
                } else {
                    this.logger.info(`📎 PR: ${chalk.gray('No PR found for this task')}`);
                }

                this.logger.info('');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to get task info: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskStartCommand(options: LinearCommandsOptions) {
    return class TaskCommand extends Command {
        static override paths = getCommandPaths(options);
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Start working on a Linear task',
            details: 'Find or create a GitHub PR for a Linear task and checkout the branch',
            examples: [
                ['Start work on task by ID', 'task SIG-123'],
                ['Start work on task by ID without prefix', 'task 123'],
                ['Start work on task by URL', 'task https://linear.app/sig/issue/SIG-123/some-task'],
            ],
        });

        taskIdentifier = Option.String({ required: true });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGithubConfig(options),
            ]);

            try {
                // Parse task identifier to get the issue ID
                const issueId = parseTaskIdentifier(this.taskIdentifier, linearConfig.defaultPrefix);

                // Get Linear issue details with team information
                const linearClient = createLinearClient(linearConfig);

                // Create GitHub client and get base branches
                const [githubClient, baseBranches] = await Promise.all([
                    Promise.resolve(createGithubClient(githubConfig)),
                    getBaseBranches(options),
                ]);

                // Use the common switch to task utility
                await switchToTask({
                    issueId,
                    linearClient,
                    githubClient: githubClient,
                    githubConfig,
                    logger: this.logger,
                    baseBranches,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(
                    `❌ Failed to start work on task ${chalk.bold(this.taskIdentifier)}: ${errorMessage}`,
                );
                throw error;
            }
        }
    };
}

function defineTaskNewCommand(options: LinearCommandsOptions) {
    return class TaskNewCommand extends Command {
        static override paths = getCommandPaths(options, 'new');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Create a new Linear task and start working on it',
            details:
                'Creates a new task in a Linear project, then automatically starts working on it by creating a branch and PR',
            examples: [
                ['Create new task with prompts', 'task new'],
                ['Create task with title', 'task new "Fix authentication bug"'],
                ['Create task with project and title', 'task new "Fix auth bug" --project PROJECT_ID'],
            ],
        });

        title = Option.String({ required: false });
        projectId = Option.String('--project, -p', { required: false });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGithubConfig(options),
            ]);

            try {
                const linearClient = createLinearClient(linearConfig);
                let selectedProjectId = this.projectId;
                let taskTitle = this.title;

                // If no project ID provided, prompt user to select one
                if (!selectedProjectId) {
                    this.logger.info('🔍 Loading available projects...');
                    const projects = await getNonCompleteProjects(linearClient);

                    if (projects.length === 0) {
                        throw new UsageError('No active projects found in your Linear workspace');
                    }

                    const { projectChoice } = await enquirer.prompt<{ projectChoice: string }>({
                        type: 'select',
                        name: 'projectChoice',
                        message: 'Select a project for the new task:',
                        choices: projects.map(project => ({
                            name: project.id,
                            message: `${chalk.bold(project.name)} ${formatProjectStatus(project.state)}`,
                        })),
                    });

                    selectedProjectId = projectChoice;
                }

                // If no title provided, prompt user to enter one
                if (!taskTitle) {
                    const { titleInput } = await enquirer.prompt<{ titleInput: string }>({
                        type: 'input',
                        name: 'titleInput',
                        message: 'Enter the task title:',
                        validate: (input: string) => {
                            if (!input.trim()) {
                                return 'Task title cannot be empty';
                            }
                            return true;
                        },
                    });

                    taskTitle = titleInput.trim();
                }

                this.logger.info(`📝 Creating new Linear task: ${chalk.green(taskTitle)}`);
                this.logger.info(`🏗️  Using project ID: ${chalk.yellow(selectedProjectId)}`);

                // Create the Linear issue
                const issueId = await createLinearIssue(linearClient, {
                    title: taskTitle,
                    projectId: selectedProjectId,
                });

                this.logger.info(`✅ Created Linear task: ${chalk.bold.green(issueId)}`);

                // Create GitHub client and get base branches
                const [githubClient, baseBranches] = await Promise.all([
                    Promise.resolve(createGithubClient(githubConfig)),
                    getBaseBranches(options),
                ]);

                // Switch to the newly created task
                await switchToTask({
                    issueId,
                    linearClient,
                    githubClient: githubClient,
                    githubConfig,
                    logger: this.logger,
                    baseBranches,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to create new task: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskPushCommand(options: LinearCommandsOptions) {
    return class TaskPushCommand extends Command {
        static override paths = getCommandPaths(options, 'push');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Push changes and handle submodules without marking PR as ready',
            details:
                'Commits and pushes changes in both submodules and main repository. Useful when you want to push work in progress without marking the PR as ready for review.',
            examples: [
                ['Push current task changes', 'task push'],
                ['Push without processing submodules', 'task push --skip-submodules'],
                ['Push with auto-commit (skip prompts)', 'task push --yes'],
            ],
        });

        skipSubmodules = Option.Boolean('--skip-submodules', false, {
            description: 'Skip processing submodules',
        });

        yes = Option.Boolean('--yes,-y', false, {
            description: 'Skip prompts and automatically commit with default message',
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGithubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Check if PR exists and is in review
                const pr = await findMatchingPr(githubClient, githubConfig, taskId);
                const prInReview = pr ? !pr.draft : false;

                // Get base branches
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches[0] ?? 'main';

                // Handle preparation (submodules and main repo)
                await handlePushPreparation({
                    githubClient,
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                    baseBranch,
                    skipSubmodules: this.skipSubmodules,
                    autoYes: this.yes,
                    prInReview,
                });

                this.logger.info('');
                this.logger.info(`🎉 Successfully pushed all changes for task ${chalk.bold(taskId)}!`);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to push task changes: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskReadyCommand(options: LinearCommandsOptions) {
    return class ReadyCommand extends Command {
        static override paths = getCommandPaths(options, 'ready');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Convert current task from draft to ready for review',
            details:
                'Detects the task from the current branch and converts the associated PR from draft to ready for review',
            examples: [
                ['Convert current task to ready for review', 'task ready'],
                ['Convert to ready without processing submodules', 'task ready --skip-submodules'],
                ['Convert to ready with auto-commit (skip prompts)', 'task ready --yes'],
            ],
        });

        skipSubmodules = Option.Boolean('--skip-submodules', false, {
            description: 'Skip processing submodules',
        });

        yes = Option.Boolean('--yes,-y', false, {
            description: 'Skip prompts and automatically commit with default message',
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGithubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Find the PR for this task
                this.logger.info('🔍 Looking for associated GitHub PR...');
                const pr = await findMatchingPr(githubClient, githubConfig, taskId);

                if (!pr) {
                    throw new UsageError(
                        `No GitHub PR found for task ${chalk.bold(taskId)}. ` +
                            `Make sure you have created a PR for this task first using "task ${chalk.bold(taskId)}".`,
                    );
                }

                this.logger.info(`✅ Found PR: ${chalk.blue(pr.title)} ${chalk.gray(`(#${pr.number})`)}`);

                // Check if PR is already in review
                const prInReview = !pr.draft;

                // Handle preparation (submodules and main repo)
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches.length > 0 ? baseBranches[0]! : pr.base.ref;

                await handlePushPreparation({
                    githubClient,
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                    baseBranch,
                    skipSubmodules: this.skipSubmodules,
                    autoYes: this.yes,
                    prInReview,
                    defaultCommitMessage: 'Ready for review',
                });

                // Convert all PRs (main and submodules) to ready
                await convertAllPrsToReady({
                    githubClient,
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                    mainPrNumber: pr.number,
                    mainPrIsDraft: pr.draft,
                    mainPrUrl: pr.html_url,
                    skipSubmodules: this.skipSubmodules,
                });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to push task to review: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskRefreshCommand(options: LinearCommandsOptions) {
    return class TaskRefreshCommand extends Command {
        static override paths = getCommandPaths(options, 'refresh');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Refresh current task branch with latest base branch changes',
            details:
                'Fetches the base branch, fast-forwards it, and optionally merges it into the current task branch if it is ahead',
            examples: [['Refresh current task with base branch', 'task refresh']],
        });

        override async run() {
            await options.beforeEach?.();

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Get base branches
                const baseBranches = await getBaseBranches(options);
                if (baseBranches.length === 0) {
                    throw new UsageError('No base branches configured');
                }

                // For refresh, use the first base branch as default (backward compatibility)
                const baseBranch = baseBranches[0]!;
                this.logger.info(`🔄 Refreshing task ${chalk.bold(taskId)} with base branch ${chalk.cyan(baseBranch)}`);

                // Sync with base branch - automatically merge without prompting
                const result = await syncBaseBranch(baseBranch, this.logger, true);

                if (result.mergePerformed) {
                    this.logger.info(
                        `🎉 Successfully merged ${chalk.yellow(result.commitsAhead?.toString())} commit${
                            result.commitsAhead === 1 ? '' : 's'
                        } from ${chalk.cyan(baseBranch)}`,
                    );
                } else if (result.wasBaseBranchAhead) {
                    this.logger.info(`⏭️  Base branch changes available but not merged`);
                } else {
                    this.logger.info(`✅ Task branch is already up to date with ${chalk.cyan(baseBranch)}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to refresh task: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskListCommand(options: LinearCommandsOptions) {
    return class TaskListCommand extends Command {
        static override paths = getCommandPaths(options, 'list');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'List and select from tasks in todo, in progress, and in review assigned to you',
            details:
                'Shows all currently active tasks (Todo, In Progress and In Review) assigned to you, along with their associated GitHub PRs, in an interactive selection menu',
            examples: [
                ['Show task list and switch to selected task', 'task list'],
                ['Show task list including unassigned tasks', 'task list --unassigned'],
            ],
        });

        unassigned = Option.Boolean('--unassigned,-u', false, {
            description: 'Include unassigned tasks',
        });

        override async run() {
            await options.beforeEach?.();

            // Load both configs in parallel
            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGithubConfig(options),
            ]);

            try {
                // Create clients in parallel
                const [linearClient, githubClient] = await Promise.all([
                    Promise.resolve(createLinearClient(linearConfig)),
                    Promise.resolve(createGithubClient(githubConfig)),
                ]);

                this.logger.info('🔍 Fetching your active tasks...');

                // Get current user
                const currentUser = await linearClient.viewer;

                // Build filter based on whether we want unassigned tasks
                const filter = {
                    state: {
                        name: {
                            in: ['Todo', 'In Progress', 'In Review'],
                        },
                    },
                    assignee: this.unassigned
                        ? { or: [{ id: { eq: currentUser.id } }, { null: true }] }
                        : { id: { eq: currentUser.id } },
                };

                // Get issues based on filter
                const issuesQuery = await linearClient.issues({ filter });

                const issues = issuesQuery.nodes;

                if (issues.length === 0) {
                    this.logger.info('📝 No active tasks found (Todo, In Progress or In Review)');
                    return;
                }

                // Sort tasks by priority (descending - higher priority first)
                // Linear priority: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
                const sortedIssues = issues.sort((a, b) => {
                    // Treat 0 (no priority) as lowest priority
                    const priorityA = a.priority === 0 ? 5 : a.priority;
                    const priorityB = b.priority === 0 ? 5 : b.priority;
                    return priorityA - priorityB;
                });

                this.logger.info(
                    `✅ Found ${chalk.bold(sortedIssues.length.toString())} active task${sortedIssues.length === 1 ? '' : 's'}`,
                );

                // Get current branch to mark which task is currently active
                const currentBranch = await getCurrentBranch();
                let currentTaskId: string | null = null;
                try {
                    currentTaskId = extractTaskIdFromBranch(currentBranch);
                } catch {
                    // No task ID in current branch, that's fine
                }

                // Fetch PR information for each task in parallel
                this.logger.info('🔍 Looking for associated GitHub PRs...');
                const tasksWithPrInfo = await Promise.all(
                    sortedIssues.map(async issue => {
                        const pr = await findMatchingPr(githubClient, githubConfig, issue.identifier);
                        return {
                            issue,
                            pr,
                        };
                    }),
                );

                // First, collect all task data to calculate column widths
                const taskData = await Promise.all(
                    tasksWithPrInfo.map(async ({ issue, pr }) => {
                        const [state, project, assignee] = await Promise.all([
                            issue.state,
                            issue.project,
                            issue.assignee,
                        ]);
                        const stateName = state?.name || 'Unknown';
                        const priority = issue.priority;

                        // Determine color based on state
                        let stateColor: typeof chalk.blue;
                        if (stateName === 'Todo') {
                            stateColor = chalk.blue;
                        } else if (stateName === 'In Progress') {
                            stateColor = chalk.yellow;
                        } else if (stateName === 'In Review') {
                            stateColor = chalk.green;
                        } else {
                            stateColor = chalk.gray;
                        }

                        // Format priority with color
                        let priorityText: string;
                        let priorityColor: typeof chalk.red;
                        if (priority === 1) {
                            priorityText = 'Urgent';
                            priorityColor = chalk.red;
                        } else if (priority === 2) {
                            priorityText = 'High';
                            priorityColor = chalk.magenta;
                        } else if (priority === 3) {
                            priorityText = 'Medium';
                            priorityColor = chalk.yellow;
                        } else if (priority === 4) {
                            priorityText = 'Low';
                            priorityColor = chalk.blue;
                        } else {
                            priorityText = 'None';
                            priorityColor = chalk.gray;
                        }

                        const isCurrentTask = currentTaskId === issue.identifier;
                        const projectName = project ? project.name : 'No Project';
                        const prText = pr ? `#${pr.number}` : 'No PR';
                        const assigneeName = assignee ? assignee.name : 'Unassigned';

                        return {
                            issue,
                            pr,
                            stateName,
                            stateColor,
                            priorityText,
                            priorityColor,
                            isCurrentTask,
                            projectName,
                            prText,
                            assigneeName,
                        };
                    }),
                );

                // Calculate maximum column widths
                const maxTaskIdWidth = Math.max(...taskData.map(t => t.issue.identifier.length));
                const maxProjectWidth = Math.max(...taskData.map(t => t.projectName.length));
                const maxTitleWidth = Math.max(...taskData.map(t => t.issue.title.length), 40);
                const maxPriorityWidth = Math.max(...taskData.map(t => t.priorityText.length));
                const maxStatusWidth = Math.max(...taskData.map(t => t.stateName.length));
                const maxPrWidth = Math.max(...taskData.map(t => t.prText.length));
                const maxAssigneeWidth = Math.max(...taskData.map(t => t.assigneeName.length));

                // Format choices for enquirer
                const choices = taskData.map(
                    ({
                        issue,
                        isCurrentTask,
                        projectName,
                        stateName,
                        stateColor,
                        priorityText,
                        priorityColor,
                        prText,
                        assigneeName,
                    }) => {
                        const currentIndicator = isCurrentTask ? chalk.cyan('★ ') : '  ';

                        // Format with padding for table-like alignment
                        const taskId = chalk.bold.white(issue.identifier.padEnd(maxTaskIdWidth));
                        const projectDisplay =
                            projectName === 'No Project'
                                ? chalk.gray(projectName.padEnd(maxProjectWidth))
                                : chalk.cyan(projectName.padEnd(maxProjectWidth));
                        const taskTitle = chalk.white(issue.title.padEnd(maxTitleWidth).slice(0, maxTitleWidth));
                        const priorityDisplay = priorityColor(priorityText.padEnd(maxPriorityWidth));
                        const statusDisplay = stateColor(stateName.padEnd(maxStatusWidth));
                        const prInfo =
                            prText === 'No PR'
                                ? chalk.gray(prText.padEnd(maxPrWidth))
                                : chalk.green(prText.padEnd(maxPrWidth));
                        const assigneeDisplay =
                            assigneeName === 'Unassigned'
                                ? chalk.gray(assigneeName.padEnd(maxAssigneeWidth))
                                : chalk.blue(assigneeName.padEnd(maxAssigneeWidth));

                        const message = `${currentIndicator}${taskId} ${chalk.gray('│')} ${projectDisplay} ${chalk.gray('│')} ${taskTitle} ${chalk.gray('│')} ${priorityDisplay} ${chalk.gray('│')} ${statusDisplay} ${chalk.gray('│')} ${assigneeDisplay} ${chalk.gray('│')} ${prInfo}`;

                        return {
                            name: issue.identifier,
                            message,
                        };
                    },
                );

                // Show selection prompt
                const { selectedTaskId } = await enquirer.prompt<{ selectedTaskId: string }>({
                    type: 'select',
                    name: 'selectedTaskId',
                    message: 'Select a task to switch to:',
                    choices,
                });

                // Find the selected task data
                const selectedTaskData = tasksWithPrInfo.find(({ issue }) => issue.identifier === selectedTaskId);

                if (!selectedTaskData) {
                    throw new UsageError(`Task ${chalk.bold(selectedTaskId)} not found`);
                }

                this.logger.info(`🎯 Switching to task: ${chalk.bold.green(selectedTaskId)}`);

                // Get base branches
                const baseBranches = await getBaseBranches(options);

                // Use the common switch to task utility
                await switchToTask({
                    issueId: selectedTaskId,
                    linearClient,
                    githubClient: githubClient,
                    githubConfig,
                    logger: this.logger,
                    baseBranches,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to list tasks: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskOpenCommand(options: LinearCommandsOptions) {
    return class TaskOpenCommand extends Command {
        static override paths = getCommandPaths(options, 'open');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Open the current Linear task in the browser',
            details: 'Detects the task from the current branch and opens the Linear task URL in your default browser',
            examples: [['Open current task in browser', 'task open']],
        });

        override async run() {
            await options.beforeEach?.();

            const linearConfig = await getLinearConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create Linear client
                const linearClient = createLinearClient(linearConfig);

                // Get task details
                this.logger.info('🔍 Fetching task details...');
                const issueData = await linearClient.issue(taskId);

                if (!issueData) {
                    throw new UsageError(`Linear task ${chalk.bold(taskId)} not found`);
                }

                this.logger.info(`🚀 Opening task ${chalk.bold(taskId)} in browser...`);
                this.logger.info(`🔗 URL: ${chalk.underline(issueData.url)}`);

                await open(issueData.url);

                this.logger.info(`✅ Task opened successfully!`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to open task: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskPrCommand(options: LinearCommandsOptions) {
    return class TaskPrCommand extends Command {
        static override paths = getCommandPaths(options, 'pr');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Open the current task PR in the browser',
            details:
                'Detects the task from the current branch, finds the associated GitHub PR, and opens it in your default browser. If multiple PRs exist (main repo + submodules), lets you choose which one to open.',
            examples: [['Open current task PR in browser', 'task pr']],
        });

        override async run() {
            await options.beforeEach?.();

            const githubConfig = await getGithubConfig(options);

            try {
                // Get current branch
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                // Extract task ID from branch name
                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Find, select, and open PR in browser
                this.logger.info('🔍 Looking for associated GitHub PRs...');
                await openPrInBrowser({
                    githubClient,
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to open PR: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function getCommandPaths(options: LinearCommandsOptions, ...commands: string[]) {
    if (options.prefix) {
        return [[options.prefix, ...commands]];
    }

    return [[...commands]];
}

async function getLinearConfig(options: LinearCommandsOptions): Promise<LinearConfig> {
    if (typeof options.linear === 'function') {
        return await options.linear();
    }

    return options.linear;
}

async function getGithubConfig(options: LinearCommandsOptions): Promise<GithubConfig> {
    if (typeof options.github === 'function') {
        return await options.github();
    }

    return options.github;
}

async function getBaseBranches(options: LinearCommandsOptions): Promise<string[]> {
    if (typeof options.baseBranch === 'function') {
        const result = await options.baseBranch();
        return Array.isArray(result) ? result : [result];
    }

    if (Array.isArray(options.baseBranch)) {
        return options.baseBranch;
    }

    return options.baseBranch ? [options.baseBranch] : [];
}
