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
        conflicted: number;
        created: number;
        deleted: number;
        modified: number;
        renamed: number;
        staged: number;
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

        const changes = {
            modified: status.modified.length,
            staged: status.staged.length,
            untracked: status.not_added.length,
            deleted: status.deleted.length,
            created: status.created.length,
            renamed: status.renamed.length,
            conflicted: status.conflicted.length,
        };

        const totalChanges = Object.values(changes).reduce((sum, count) => sum + count, 0);
        const hasUncommittedChanges = totalChanges > 0;

        const changeTypes: string[] = [];
        if (changes.modified > 0) {
            changeTypes.push(`${changes.modified} modified`);
        }
        if (changes.staged > 0) {
            changeTypes.push(`${changes.staged} staged`);
        }
        if (changes.untracked > 0) {
            changeTypes.push(`${changes.untracked} untracked`);
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
