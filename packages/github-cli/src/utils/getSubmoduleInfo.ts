import { simpleGit } from 'simple-git';

/**
 * Information about a git submodule.
 */
export interface SubmoduleInfo {
    /**
     * Path to the submodule.
     */
    path: string;

    /**
     * Name of the submodule.
     */
    name: string;

    /**
     * URL of the submodule repository.
     */
    url: string;

    /**
     * Whether the submodule has uncommitted changes.
     */
    hasChanges: boolean;

    /**
     * Current branch of the submodule.
     */
    currentBranch?: string;

    /**
     * Number of unpushed commits in the submodule.
     */
    unpushedCommitsCount: number;

    /**
     * Whether the submodule has a remote branch.
     */
    hasRemoteBranch: boolean;
}

/**
 * Get information about all submodules in the repository.
 */
export async function getSubmoduleInfo(): Promise<SubmoduleInfo[]> {
    const git = simpleGit();

    try {
        // Check if .gitmodules exists
        const submodules = await git.raw(['config', '--file', '.gitmodules', '--get-regexp', 'path']);

        if (!submodules.trim()) {
            return [];
        }

        // Parse submodule paths
        const submodulePaths: string[] = [];
        const lines = submodules.trim().split('\n');
        for (const line of lines) {
            const match = line.match(/^submodule\.(.+)\.path\s+(.+)$/);
            if (match) {
                submodulePaths.push(match[2]!);
            }
        }

        // Get info for each submodule
        const submoduleInfos: SubmoduleInfo[] = [];
        for (const path of submodulePaths) {
            const submoduleGit = simpleGit({ baseDir: path });

            try {
                // Get submodule status
                const status = await submoduleGit.status();
                const hasChanges = status.files.length > 0;

                // Get submodule URL
                const url = await git.raw(['config', '--file', '.gitmodules', '--get', `submodule.${path}.url`]);

                // Get current branch
                const currentBranch = status.current || undefined;

                // Check for unpushed commits
                let unpushedCommitsCount = 0;
                let hasRemoteBranch = false;
                if (currentBranch) {
                    const remoteRef = `origin/${currentBranch}`;
                    try {
                        await submoduleGit.raw(['show-ref', '--verify', '--quiet', `refs/remotes/${remoteRef}`]);
                        hasRemoteBranch = true;

                        const result = await submoduleGit.raw([
                            'rev-list',
                            '--count',
                            `${remoteRef}..${currentBranch}`,
                        ]);
                        unpushedCommitsCount = parseInt(result.trim(), 10);
                    } catch {
                        // Remote branch doesn't exist
                        hasRemoteBranch = false;
                        const log = await submoduleGit.log(['--oneline']);
                        unpushedCommitsCount = log.all.length;
                    }
                }

                submoduleInfos.push({
                    path,
                    name: path.split('/').pop() || path,
                    url: url.trim(),
                    hasChanges,
                    currentBranch,
                    unpushedCommitsCount,
                    hasRemoteBranch,
                });
            } catch (_error) {
                // Skip submodules that can't be accessed
                continue;
            }
        }

        return submoduleInfos;
    } catch (_error) {
        // No submodules or error reading them
        return [];
    }
}
