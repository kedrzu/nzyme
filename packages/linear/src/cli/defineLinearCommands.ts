import chalk from 'chalk';
import enquirer from 'enquirer';
import open from 'open';

import { Option, UsageError } from '@nzyme/cli';
import type { CommandClass } from '@nzyme/cli/Command.js';
import { Command } from '@nzyme/cli/Command.js';
import type { GithubConfig } from '@nzyme/github-cli/GithubConfig.js';
import { GitMergeConflictError } from '@nzyme/github-cli/utils/GitMergeConflictError.js';
import { convertAllPrsToReady } from '@nzyme/github-cli/utils/convertAllPrsToReady.js';
import { createGithubClient } from '@nzyme/github-cli/utils/createGithubClient.js';
import { findMatchingPr, findTaskPrs, resolveNodePr } from '@nzyme/github-cli/utils/findMatchingPr.js';
import { getCurrentBranch } from '@nzyme/github-cli/utils/getCurrentBranch.js';
import { mergeTaskPrs } from '@nzyme/github-cli/utils/mergeTaskPrs.js';
import { orderStackNodes } from '@nzyme/github-cli/utils/orderStackNodes.js';
import { pushChanges } from '@nzyme/github-cli/utils/pushChanges.js';
import { returnToBranch } from '@nzyme/github-cli/utils/returnToBranch.js';
import { openPrInBrowser } from '@nzyme/github-cli/utils/selectPrToOpen.js';
import { logStackConflictGuidance, refreshStack } from '@nzyme/github-cli/utils/refreshStack.js';
import { findStackForPr } from '@nzyme/github-cli/utils/stacksApi.js';
import { syncAllRepos } from '@nzyme/github-cli/utils/syncAllRepos.js';

import { createLinearClient } from '../utils/createLinearClient.js';
import { createLinearIssue } from '../utils/createLinearIssue.js';
import { extractTaskIdFromBranch } from '../utils/extractTaskIdFromBranch.js';
import { formatProjectStatus } from '../utils/formatProjectStatus.js';
import { getNonCompleteProjects } from '../utils/getProjects.js';
import { parseTaskIdentifier } from '../utils/parseTaskIdentifier.js';
import { stackTask } from '../utils/stackTask.js';
import { switchToTask } from '../utils/switchToTask.js';
import type { TaskSwitchedHook } from './TaskSwitchedHook.js';

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
     * Called after a command has successfully switched to a task.
     * Failures are logged and never fail the command.
     */
    onTaskSwitched?: TaskSwitchedHook;

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
        defineTaskStackCommand(options),
        defineTaskPushCommand(options),
        defineTaskReadyCommand(options),
        defineTaskRefreshCommand(options),
        defineTaskMergeCommand(options),
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

                // Get task details and search for PRs in parallel
                this.logger.info('🔍 Fetching task details and searching for associated PRs...');
                const [issueData, prs] = await Promise.all([
                    linearClient.issue(taskId),
                    findTaskPrs(githubClient, githubConfig, taskId),
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

                if (prs.length === 0) {
                    this.logger.info(`📎 PR: ${chalk.gray('No PR found for this task')}`);
                } else {
                    if (prs.length > 1) {
                        this.logger.info(`🧱 Stack: ${chalk.bold(prs.length.toString())} pull requests (bottom → top)`);
                    }

                    for (const [index, pr] of prs.entries()) {
                        const label = prs.length > 1 ? `📎 PR ${index + 1}/${prs.length}` : '📎 PR';
                        const status = pr.draft ? chalk.yellow('Draft') : chalk.green('Ready for review');
                        const marker = pr.head.ref === currentBranch ? chalk.cyan(' ★') : '';

                        this.logger.info(
                            `${label}: ${chalk.blue(pr.title)} ${chalk.gray(`(#${pr.number})`)} — ${status}${marker}`,
                        );
                        this.logger.info(`   ${chalk.blueBright(chalk.underline(pr.html_url))}`);
                    }
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
                ['Start work branching from a specific branch', 'task SIG-123 --branch develop'],
                ['Check out the bottom node of a stacked task', 'task SIG-123 --node 1'],
            ],
        });

        taskIdentifier = Option.String({ required: true });
        branch = Option.String('--branch', {
            description:
                'Base branch to create the new branch from (defaults to the configured base branch, e.g. main)',
        });
        node = Option.String('--node', {
            description: 'For a stacked task, the 1-based node to check out (defaults to the top node)',
        });

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
                    branch: this.branch,
                    node: parseNodeOption(this.node),
                    onTaskSwitched: options.onTaskSwitched,
                });
            } catch (error) {
                if (error instanceof GitMergeConflictError) {
                    // The branch is checked out and the task is marked as started - only the base
                    // branch sync is left unfinished, so point at how to complete it.
                    this.logger.error(
                        `❌ Switched to task ${chalk.bold(this.taskIdentifier)}, but syncing with the base branch conflicted`,
                    );
                    this.logger.info(
                        `💡 Resolve the conflicts, commit them, then run ${chalk.cyan('task refresh')} to finish the sync`,
                    );
                    throw error;
                }

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
        branch = Option.String('--branch', {
            description:
                'Base branch to create the new branch from (defaults to the configured base branch, e.g. main)',
        });

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
                    branch: this.branch,
                    onTaskSwitched: options.onTaskSwitched,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to create new task: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskStackCommand(options: LinearCommandsOptions) {
    return class TaskStackCommand extends Command {
        static override paths = getCommandPaths(options, 'stack');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Stack another pull request on top of the current one',
            details:
                'Creates the next node of a stacked chain: a branch forked from the current node, a draft PR based ' +
                'on it, and the GitHub stack tying them together (created on the first extra node). The task keeps ' +
                'one Linear issue — Linear links every PR whose branch carries the issue ID and waits for all of ' +
                'them to merge, so nodes need no sub-issues. Requires the current node to be committed and pushed, ' +
                'so the new node forks from a complete parent.',
            examples: [
                ['Stack a node on top of the current one', 'task stack "API endpoints"'],
                ['Split schema work from the UI that consumes it', 'task stack "Patient list UI"'],
            ],
        });

        nodeTitle = Option.String({ required: true });

        override async run() {
            await options.beforeEach?.();

            const [linearConfig, githubConfig] = await Promise.all([
                getLinearConfig(options),
                getGithubConfig(options),
            ]);

            try {
                const currentBranch = await getCurrentBranch();
                this.logger.info(`📍 Current branch: ${chalk.cyan(currentBranch)}`);

                const taskId = extractTaskIdFromBranch(currentBranch);
                this.logger.info(`🎯 Found task ID: ${chalk.bold(taskId)}`);

                await stackTask({
                    issueId: taskId,
                    nodeTitle: this.nodeTitle,
                    linearClient: createLinearClient(linearConfig),
                    githubClient: createGithubClient(githubConfig),
                    githubConfig,
                    logger: this.logger,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to stack a new node: ${errorMessage}`);
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
            examples: [['Push current task changes', 'task push']],
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

                // Get base branches
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches[0] ?? 'main';

                // Push changes
                await pushChanges({
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                    baseBranch,
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
            description: 'Push changes and convert current task from draft to ready for review',
            details:
                'Pushes all changes (syncing repos, handling submodules) and converts the associated PR from draft to ready for review',
            examples: [['Push and convert current task to ready for review', 'task ready']],
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

                // Get base branches
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches[0] ?? 'main';

                // Push all changes (same as push command)
                const { githubClient, pr } = await pushChanges({
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                    baseBranch,
                    defaultCommitMessage: 'Ready for review',
                });

                // Every node leaves draft, not just the one we are standing on: the human reviews the
                // whole chain, and a node left in draft reads as unfinished work. `findTaskPrs`
                // already returns them bottom to top, and an ordinary task simply has one.
                const taskPrs = await findTaskPrs(githubClient, githubConfig, taskId);
                const readyPr = pr ?? (await resolveNodePr(githubClient, githubConfig, taskId, currentBranch));
                const mainPrs = taskPrs.length > 0 ? taskPrs : readyPr ? [readyPr] : [];

                if (mainPrs.length === 0) {
                    throw new UsageError(
                        `No GitHub PR found for task ${chalk.bold(taskId)}. ` +
                            `Make sure you have created a PR for this task first using "task ${chalk.bold(taskId)}".`,
                    );
                }

                // Convert all PRs (every main-repository node and the submodules) to ready
                await convertAllPrsToReady({
                    githubClient,
                    githubConfig,
                    issueId: taskId,
                    logger: this.logger,
                    mainPrs,
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
                'Fetches the base branch, fast-forwards it, and merges it into the current task branch and all submodules. Pushes submodule changes and commits submodule reference updates.',
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

                const baseBranch = baseBranches[0]!;

                const githubConfig = await getGithubConfig(options);
                const githubClient = createGithubClient(githubConfig);
                const taskPrs = await findTaskPrs(githubClient, githubConfig, taskId);

                // A stacked task is refreshed as a whole: the trunk goes into the bottom node and
                // travels up from there. Refreshing only the node you happen to stand on would both
                // miss the conflict (the trunk meets the stack at the bottom) and, on an upper node,
                // pull the trunk into a diff that is measured against the node below it.
                // Which node feeds which is GitHub's stack record to answer, exactly as it is for the
                // merge — the cascade pushes every node it touches, so guessing the order from the
                // `--sN` suffix would push one PR's whole diff into an unrelated one. A lone PR has
                // no stack to look up and comes back `null`, which is the ordinary unstacked path.
                const stack =
                    taskPrs.length > 1 ? await findStackForPr(githubClient, githubConfig, taskPrs[0]!.number) : null;

                const nodes = orderStackNodes({
                    prs: taskPrs,
                    stack,
                    issueId: taskId,
                    reason: 'Refreshing merges each one into the next, so it needs the stack to know which order that is.',
                });

                if (nodes) {
                    await refreshStack({
                        branches: nodes.map(pr => pr.head.ref),
                        trunk: baseBranch,
                        logger: this.logger,
                    });

                    this.logger.info('');
                    this.logger.info(`🎉 Refreshed the whole stack of ${chalk.bold(nodes.length.toString())} nodes`);
                    return;
                }

                this.logger.info(`🔄 Refreshing task ${chalk.bold(taskId)} with base branch ${chalk.cyan(baseBranch)}`);

                // Sync all repos: auto-commit, fetch, rebase/pull, ff base, merge base, push
                const syncResult = await syncAllRepos({
                    baseBranch,
                    logger: this.logger,
                });

                this.logger.info('');
                if (syncResult.baseMergePerformed) {
                    this.logger.info(
                        `🎉 Successfully merged ${chalk.yellow(syncResult.baseBranchCommitsAhead.toString())} commit${
                            syncResult.baseBranchCommitsAhead === 1 ? '' : 's'
                        } from ${chalk.cyan(baseBranch)}`,
                    );
                } else {
                    this.logger.info(`✅ Task branch is already up to date with ${chalk.cyan(baseBranch)}`);
                }
            } catch (error) {
                if (error instanceof GitMergeConflictError && error.stackContext) {
                    // The generic conflict report already listed the files; this adds the part only
                    // the stack knows — which node owns the fix and what still has to follow it.
                    logStackConflictGuidance(error, this.logger);
                    throw error;
                }

                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to refresh task: ${errorMessage}`);
                throw error;
            }
        }
    };
}

function defineTaskMergeCommand(options: LinearCommandsOptions) {
    return class TaskMergeCommand extends Command {
        static override paths = getCommandPaths(options, 'merge');
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Squash-merge the current task PRs (submodules first, then main repo)',
            details:
                'Squash-merges the current task via the GitHub API. Submodule PRs are merged first, then the ' +
                'main repository branch is refreshed so its submodule references point at the merged commits, ' +
                'and finally the main repository PR is squash-merged. It aborts if the main repository or any ' +
                'submodule has uncommitted changes. Before merging it summarises every PR with its URL, draft ' +
                'state and unresolved review-comment count, and asks for confirmation — every run, not only ' +
                'when something is unresolved. Confirming also converts any draft PR to ready. Required checks ' +
                'are always waited for before each merge. With --yes the confirmation is skipped. When the task ' +
                'is a stack, the whole chain is merged in one atomic operation — one squash commit per node, in ' +
                'stack order — after the nodes have been restacked onto the refreshed submodule references; it ' +
                'runs from any node, checking out the bottom one itself and returning you afterwards.',
            examples: [
                ['Merge current task with confirmation', 'task merge'],
                ['Merge current task without prompts', 'task merge --yes'],
                ['Merge a whole stacked chain', 'task merge'],
            ],
        });

        yes = Option.Boolean('--yes,-y', false, {
            description: 'Skip the confirmation and draft-conversion prompts',
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

                // Get base branch
                const baseBranches = await getBaseBranches(options);
                const baseBranch = baseBranches[0] ?? 'main';

                // Create GitHub client
                const githubClient = createGithubClient(githubConfig);

                // Squash-merge submodules first, refresh main, then squash-merge main. A stacked task
                // is merged from its bottom node, which `mergeTaskPrs` checks out itself — so put the
                // user back on the branch they invoked this from, whether it succeeded or not.
                try {
                    await mergeTaskPrs({
                        githubClient,
                        githubConfig,
                        issueId: taskId,
                        baseBranch,
                        logger: this.logger,
                        autoYes: this.yes,
                    });
                } finally {
                    await returnToBranch(currentBranch, this.logger);
                }
            } catch (error: unknown) {
                if (error instanceof GitMergeConflictError && error.stackContext) {
                    // The restack that precedes a stack merge conflicts in the same way a refresh
                    // does, and needs the same answer — so say the same thing rather than a bare
                    // "failed to merge".
                    logStackConflictGuidance(error, this.logger);
                    throw error;
                }

                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`❌ Failed to merge task: ${errorMessage}`);
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
        branch = Option.String('--branch', {
            description:
                'Base branch to create the new branch from (defaults to the configured base branch, e.g. main)',
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
                const sortedIssues = issues.toSorted((a, b) => {
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
                        const taskId = chalk.bold(issue.identifier.padEnd(maxTaskIdWidth));
                        const projectDisplay =
                            projectName === 'No Project'
                                ? chalk.gray(projectName.padEnd(maxProjectWidth))
                                : chalk.cyan(projectName.padEnd(maxProjectWidth));
                        const taskTitle = chalk.bold(issue.title.padEnd(maxTitleWidth).slice(0, maxTitleWidth));
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
                    branch: this.branch,
                    onTaskSwitched: options.onTaskSwitched,
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

/**
 * Parse the `--node` option into a 1-based stack position.
 */
function parseNodeOption(node: string | undefined): number | undefined {
    if (node === undefined) {
        return undefined;
    }

    const parsed = Number(node);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new UsageError(`--node must be a positive integer, got "${node}"`);
    }

    return parsed;
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
