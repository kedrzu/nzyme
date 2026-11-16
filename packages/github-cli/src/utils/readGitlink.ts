import type { SimpleGit } from 'simple-git';

/**
 * Read the commit the repository's `HEAD` records as the gitlink at `path` (a submodule's pin).
 * @util
 *
 * `rev-parse HEAD:<path>` reads it straight from the commit's tree, so it reports what the branch
 * carries, not what the submodule checkout currently has.
 */
export async function readGitlink(git: SimpleGit, path: string): Promise<string> {
    return (await git.raw(['rev-parse', `HEAD:${path}`])).trim();
}
