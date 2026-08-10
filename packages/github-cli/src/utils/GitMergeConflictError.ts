/**
 * Where in a stack a conflict happened, and what the node was being brought up to date with.
 *
 * Present only when the conflict arose while refreshing a stacked task. It is what lets the message
 * say *which* node needs the fix — in a chain, a conflict surfaced from the wrong node is the one
 * mistake that quietly ruins the other nodes' diffs.
 */
export interface StackConflictContext {
    /**
     * Branch of the node the conflict happened on.
     */
    nodeBranch: string;

    /**
     * 1-based position of that node in the stack.
     */
    nodePosition: number;

    /**
     * Total number of nodes in the stack.
     */
    nodeCount: number;

    /**
     * Branch being merged into the node — the trunk for the bottom node, the parent node otherwise.
     */
    against: string;
}

/**
 * Error thrown when a git merge or rebase operation encounters conflicts.
 */
export class GitMergeConflictError extends Error {
    /**
     * Display name of the repository where the conflict occurred.
     */
    readonly repoDisplayName: string;

    /**
     * List of files with merge conflicts.
     */
    readonly conflictedFiles: string[];

    /**
     * The operation that failed (e.g., 'merge', 'rebase').
     */
    readonly operation: string;

    /**
     * Stack position of the conflict, when it happened while refreshing a stacked task.
     *
     * Named `stackContext` rather than `stack` on purpose: `Error.stack` is the stack trace, and
     * shadowing it with an object breaks every logger that prints it.
     */
    readonly stackContext?: StackConflictContext;

    /**
     *
     */
    constructor(params: {
        repoDisplayName: string;
        conflictedFiles: string[];
        operation: string;
        message?: string;
        stackContext?: StackConflictContext;
    }) {
        super(params.message ?? `Git ${params.operation} conflict in ${params.repoDisplayName}`);
        this.name = 'GitMergeConflictError';
        this.repoDisplayName = params.repoDisplayName;
        this.conflictedFiles = params.conflictedFiles;
        this.operation = params.operation;
        this.stackContext = params.stackContext;
    }
}
