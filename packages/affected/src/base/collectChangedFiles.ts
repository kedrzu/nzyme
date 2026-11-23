import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { GitRepository } from '@nzyme/project-utils/git/GitRepository.js';

import { fingerprintBunLock } from '../fingerprint/fingerprintBunLock.js';
import { fingerprintPackageJson } from '../fingerprint/fingerprintPackageJson.js';

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
    /**
     * Root-relative globs of the full-run triggers (`AffectedConfig.fullRunTriggers`): a
     * `package.json` matching one counts by its bytes, since any change to a trigger runs everything.
     */
    fullRunTriggers?: readonly string[];
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
 * A modified file whose fingerprint is the same as at the base is not listed:
 * - a `bun.lock` that installs the same external code ({@link fingerprintBunLock}): its workspace
 *   part changed, and the workspace packages' own `package.json` files carry that change;
 * - a `package.json` that loads its package the same way ({@link fingerprintPackageJson}): only its
 *   version, scripts, dev dependencies or publishing metadata changed. Not one matching a full-run
 *   trigger (the root manifest, typically), whose every change counts.
 *
 * Returns sorted, unique paths; a path that exists in the working tree is never reported deleted.
 */
export async function collectChangedFiles(options: CollectChangedFilesOptions): Promise<ChangedFile[]> {
    const git = new GitRepository(options.root);
    const submodules = await listSubmodulePaths(options.root);
    const triggers = (options.fullRunTriggers ?? []).map(trigger => new Bun.Glob(trigger));
    function isTriggerManifest(file: string) {
        return path.posix.basename(file) === 'package.json' && triggers.some(glob => glob.match(file));
    }
    const files = new Map<string, boolean>();
    function add(filePath: string, deleted: boolean) {
        files.set(filePath, (files.get(filePath) ?? true) && deleted);
    }

    // The gitlink of a submodule shows up as a changed path in its parent; its own files stand for it.
    for (const file of await diffRepository(git, options.mergeBase, isTriggerManifest)) {
        if (!submodules.includes(file.path)) {
            add(file.path, file.deleted);
        }
    }

    for (const submodule of submodules) {
        const baseSha = await git.findGitlink(options.mergeBase, submodule);
        const sub = new GitRepository(path.join(options.root, submodule));

        if (!(await sub.isCheckedOut())) {
            if (baseSha !== (await git.findGitlink('HEAD', submodule))) {
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
                : await diffRepository(sub, baseSha, file => isTriggerManifest(`${submodule}/${file}`));
        for (const file of changed) {
            add(`${submodule}/${file.path}`, file.deleted);
        }
    }

    return [...files.entries()]
        .map(([filePath, deleted]) => ({ path: filePath, deleted }))
        .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Working tree vs `base` (renames contribute their old path as deleted) plus untracked, unignored
 * files, less a modified file whose fingerprint is the same as at `base` — unless `countsByBytes`
 * says otherwise. Paths are relative to the repository.
 */
async function diffRepository(
    git: GitRepository,
    base: string,
    countsByBytes: (file: string) => boolean,
): Promise<ChangedFile[]> {
    const result: ChangedFile[] = [];
    const diff = splitNul(await git.git(['diff', '--name-status', '-M', '-z', base]));
    for (let i = 0; i < diff.length;) {
        const status = diff[i++] ?? '';
        const first = diff[i++] ?? '';
        if (status.startsWith('R')) {
            result.push({ path: first, deleted: true }, { path: diff[i++] ?? '', deleted: false });
        } else if (status.startsWith('M') && !countsByBytes(first) && (await fingerprintsAsBase(git, base, first))) {
            continue;
        } else {
            result.push({ path: first, deleted: status.startsWith('D') });
        }
    }

    for (const file of splitNul(await git.git(['ls-files', '-z', '--others', '--exclude-standard']))) {
        result.push({ path: file, deleted: false });
    }

    return result;
}

/** Whether `file` is a `bun.lock` or a `package.json` whose working-tree copy has the same fingerprint as at `base`. */
async function fingerprintsAsBase(git: GitRepository, base: string, file: string): Promise<boolean> {
    const fingerprint = selectFingerprint(path.posix.basename(file));
    if (fingerprint === null) {
        return false;
    }

    const before = await git.tryGit(['show', `${base}:${file}`]);
    const now = await readFile(path.join(git.dir, file), 'utf8').catch(() => null);
    if (!before.ok || now === null) {
        return false;
    }

    const hash = fingerprint(now);
    return hash !== null && hash === fingerprint(before.stdout);
}

function selectFingerprint(name: string): ((content: string) => string | null) | null {
    switch (name) {
        case 'bun.lock':
            return fingerprintBunLock;
        case 'package.json':
            return fingerprintPackageJson;
        default:
            return null;
    }
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

function splitNul(output: string): string[] {
    return output.split('\0').filter(entry => entry !== '');
}
