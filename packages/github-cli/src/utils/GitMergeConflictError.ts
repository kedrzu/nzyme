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
     *
     */
    constructor(params: { repoDisplayName: string; conflictedFiles: string[]; operation: string; message?: string }) {
        super(params.message ?? `Git ${params.operation} conflict in ${params.repoDisplayName}`);
        this.name = 'GitMergeConflictError';
        this.repoDisplayName = params.repoDisplayName;
        this.conflictedFiles = params.conflictedFiles;
        this.operation = params.operation;
    }
}
