import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

/**
 * Check if there are uncommitted changes in the repository.
 * @__NO_SIDE_EFFECTS__
 */
export async function checkUncommittedChanges(): Promise<void> {
    const git = simpleGit();

    try {
        const status = await git.status();

        // Check for any uncommitted changes
        const hasChanges =
            status.files.length > 0 || // Modified, added, deleted files
            status.staged.length > 0 || // Staged files
            status.not_added.length > 0 || // Untracked files that should be added
            status.conflicted.length > 0 || // Conflicted files
            status.created.length > 0 || // Created files
            status.deleted.length > 0 || // Deleted files
            status.modified.length > 0 || // Modified files
            status.renamed.length > 0; // Renamed files

        if (hasChanges) {
            const changeTypes: string[] = [];

            if (status.modified.length > 0) {
                changeTypes.push(`${status.modified.length} modified`);
            }
            if (status.staged.length > 0) {
                changeTypes.push(`${status.staged.length} staged`);
            }
            if (status.not_added.length > 0) {
                changeTypes.push(`${status.not_added.length} untracked`);
            }
            if (status.deleted.length > 0) {
                changeTypes.push(`${status.deleted.length} deleted`);
            }
            if (status.created.length > 0) {
                changeTypes.push(`${status.created.length} created`);
            }
            if (status.renamed.length > 0) {
                changeTypes.push(`${status.renamed.length} renamed`);
            }
            if (status.conflicted.length > 0) {
                changeTypes.push(`${status.conflicted.length} conflicted`);
            }

            throw new UsageError(
                `Cannot push to review with uncommitted changes (${changeTypes.join(', ')}). ` +
                    'Please commit or stash your changes first.',
            );
        }
    } catch (error) {
        if (error instanceof UsageError) {
            throw error;
        }
        throw new UsageError(`Failed to check git status: ${(error as Error).message}`);
    }
}
