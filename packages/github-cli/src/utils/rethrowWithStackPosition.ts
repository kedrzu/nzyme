import { GitMergeConflictError } from './GitMergeConflictError.js';

/**
 * Run an operation that may throw {@link GitMergeConflictError} and re-throw it carrying the stack
 * position, so the caller can tell the user which node to fix instead of just which files broke.
 */
export async function rethrowWithStackPosition(
    operation: () => Promise<unknown>,
    stackContext: NonNullable<GitMergeConflictError['stackContext']>,
): Promise<void> {
    try {
        await operation();
    } catch (error) {
        if (error instanceof GitMergeConflictError) {
            throw new GitMergeConflictError({
                repoDisplayName: error.repoDisplayName,
                conflictedFiles: error.conflictedFiles,
                operation: error.operation,
                stackContext,
            });
        }
        throw error;
    }
}
