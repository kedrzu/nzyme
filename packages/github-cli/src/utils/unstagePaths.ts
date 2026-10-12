import type { SimpleGit } from 'simple-git';

/**
 * Put each of `paths` back in the index as `HEAD` records it, so the next commit leaves them out
 * whatever was staged for them — by `git add .` or by hand. Their working-tree state is untouched.
 *
 * Exists for pinned submodules (see `resolveSubmoduleBase`): `git add .` stages a gitlink wherever
 * its checkout happens to sit, so a submodule left on a stale or foreign commit — or one a base merge
 * re-pinned without moving the checkout — would otherwise be committed as a new pin.
 */
export async function unstagePaths(git: SimpleGit, paths: string[]): Promise<void> {
    if (paths.length === 0) {
        return;
    }

    await git.raw(['reset', '-q', '--', ...paths]);
}
