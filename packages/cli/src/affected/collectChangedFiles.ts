import path from 'node:path';

import { GitRepository } from '../submodule/GitRepository.js';

/** A file that differs from the base. Deleted files (and the old path of a rename) are included. */
export interface ChangedFile {
    /** Root-relative, `/`-separated. */
    path: string;
    /** True when the file no longer exists in the working tree. */
    deleted: boolean;
}

export interface CollectChangedFilesOptions {
    /** Top of the git working tree. */
    root: string;
    /** Commit to diff the working tree against (see `resolveAffectedBase`). */
    mergeBase: string;
}

/**
 * Files that differ between `mergeBase` and the working tree: commits since the base, staged,
 * unstaged and untracked (not ignored) changes. Submodules are diffed against the gitlink the base
 * commit recorded, with their paths prefixed by the submodule path; the gitlink itself is not listed.
 *
 * A submodule absent from the base counts as entirely new (all its tracked files). An uninitialised
 * submodule has no local changes and is skipped, unless its gitlink moved between base and `HEAD` —
 * then the change cannot be seen and this throws.
 *
 * Returns sorted, unique paths; a path that exists in the working tree is never reported deleted.
 */
export async function collectChangedFiles(options: CollectChangedFilesOptions): Promise<ChangedFile[]> {
    const git = new GitRepository(options.root);
    const submodules = await listSubmodulePaths(options.root);
    const files = new Map<string, boolean>();
    const add = (filePath: string, deleted: boolean) => {
        files.set(filePath, (files.get(filePath) ?? true) && deleted);
    };

    // The gitlink of a submodule shows up as a changed path in its parent; its own files stand for it.
    for (const file of await diffRepository(git, options.mergeBase)) {
        if (!submodules.includes(file.path)) {
            add(file.path, file.deleted);
        }
    }

    for (const submodule of submodules) {
        const baseSha = await readGitlink(git, options.mergeBase, submodule);
        const sub = new GitRepository(path.join(options.root, submodule));

        if (!(await isCheckedOut(sub))) {
            if (baseSha !== (await readGitlink(git, 'HEAD', submodule))) {
                throw new Error(
                    `Submodule "${submodule}" is not checked out but its commit changed since the base. ` +
                        'Run `git submodule update --init` first.',
                );
            }
            continue;
        }

        const changed =
            baseSha === null
                ? splitNul(await sub.git(['ls-files', '-z'])).map(filePath => ({ path: filePath, deleted: false }))
                : await diffRepository(sub, baseSha);
        for (const file of changed) {
            add(`${submodule}/${file.path}`, file.deleted);
        }
    }

    return [...files.entries()]
        .map(([filePath, deleted]) => ({ path: filePath, deleted }))
        .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Working tree vs `base` (renames contribute their old path as deleted) plus untracked, unignored files. */
async function diffRepository(git: GitRepository, base: string): Promise<ChangedFile[]> {
    const result: ChangedFile[] = [];
    const diff = splitNul(await git.git(['diff', '--name-status', '-M', '-z', base]));
    for (let i = 0; i < diff.length;) {
        const status = diff[i++] ?? '';
        const first = diff[i++] ?? '';
        if (status.startsWith('R')) {
            result.push({ path: first, deleted: true }, { path: diff[i++] ?? '', deleted: false });
        } else {
            result.push({ path: first, deleted: status.startsWith('D') });
        }
    }

    for (const file of splitNul(await git.git(['ls-files', '-z', '--others', '--exclude-standard']))) {
        result.push({ path: file, deleted: false });
    }

    return result;
}

/** Submodule paths declared in the working tree's `.gitmodules`. */
async function listSubmodulePaths(root: string): Promise<string[]> {
    const git = new GitRepository(root);
    const result = await git.tryGit(['config', '-f', '.gitmodules', '-z', '--get-regexp', '^submodule\\..*\\.path$']);
    if (!result.ok) {
        // Exit 1 means "no match" (no .gitmodules or no submodules); anything else is a real failure.
        if (result.exitCode === 1) {
            return [];
        }
        throw new Error(`Cannot read .gitmodules in ${root}: ${result.stderr}`);
    }

    return splitNul(result.stdout).map(entry => entry.slice(entry.indexOf('\n') + 1));
}

/** The submodule commit recorded for `submodulePath` in `revision`, or `null` when it is not a submodule there. */
async function readGitlink(git: GitRepository, revision: string, submodulePath: string): Promise<string | null> {
    const entry = await git.git(['ls-tree', revision, '--', submodulePath]);
    const match = /^160000 commit ([0-9a-f]+)\t/.exec(entry);
    return match?.[1] ?? null;
}

/** An uninitialised submodule is an empty directory, where git would act on the parent repository. */
async function isCheckedOut(git: GitRepository): Promise<boolean> {
    try {
        await git.assertCheckedOut();
        return true;
    } catch {
        return false;
    }
}

function splitNul(output: string): string[] {
    return output.split('\0').filter(entry => entry !== '');
}
