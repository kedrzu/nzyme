import { simpleGit } from 'simple-git';

/**
 * Information about git status.
 */
export interface GitStatusInfo {
    /**
     * Whether there are uncommitted changes.
     */
    hasUncommittedChanges: boolean;

    /**
     * Total number of changed files.
     */
    totalChanges: number;

    /**
     * Description of changes.
     */
    changeDescription: string;

    /**
     * Detailed breakdown of changes.
     */
    changes: {
        /**
         * Files with merge conflicts.
         */
        conflicted: number;
        /**
         * New files that have been created.
         */
        created: number;
        /**
         * Files that have been deleted.
         */
        deleted: number;
        /**
         * Files that have been modified.
         */
        modified: number;
        /**
         * Files that have been renamed.
         */
        renamed: number;
        /**
         * Files staged for commit.
         */
        staged: number;
        /**
         * Files not tracked by git.
         */
        untracked: number;
    };
}

/**
 * Get structured information about git status.
 * @__NO_SIDE_EFFECTS__
 */
export async function getGitStatusInfo(): Promise<GitStatusInfo> {
    const git = simpleGit();

    try {
        const status = await git.status();

        // Collect detailed breakdown as requested
        const changes = {
            conflicted: status.conflicted.length,
            created: status.created.length,
            deleted: status.deleted.length,
            modified: status.modified.length,
            renamed: status.renamed.length,
            staged: status.staged.length,
            untracked: status.not_added.length,
        };

        // Calculate total without double counting staged files
        // Total = all unique files (staged + unstaged + untracked + conflicted)
        const allFiles = new Set([
            ...status.conflicted,
            ...status.created,
            ...status.deleted,
            ...status.modified,
            ...status.not_added,
            ...status.renamed.map(r => r.from || r.to),
            ...status.staged,
        ]);
        const totalChanges = allFiles.size;
        const hasUncommittedChanges = totalChanges > 0;

        const changeTypes: string[] = [];
        if (changes.modified > 0) {
            changeTypes.push(`${changes.modified} modified`);
        }
        if (changes.staged > 0) {
            changeTypes.push(`${changes.staged} staged`);
        }
        if (changes.deleted > 0) {
            changeTypes.push(`${changes.deleted} deleted`);
        }
        if (changes.created > 0) {
            changeTypes.push(`${changes.created} created`);
        }
        if (changes.renamed > 0) {
            changeTypes.push(`${changes.renamed} renamed`);
        }
        if (changes.untracked > 0) {
            changeTypes.push(`${changes.untracked} untracked`);
        }
        if (changes.conflicted > 0) {
            changeTypes.push(`${changes.conflicted} conflicted`);
        }

        const changeDescription = changeTypes.join(', ');

        return {
            hasUncommittedChanges,
            totalChanges,
            changeDescription,
            changes,
        };
    } catch (error) {
        throw new Error(`Failed to get git status: ${(error as Error).message}`);
    }
}
