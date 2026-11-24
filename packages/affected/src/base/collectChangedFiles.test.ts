import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';

import { collectChangedFiles } from './collectChangedFiles.js';

// Every test builds real git repositories.
setDefaultTimeout(60_000);

const GIT_CONFIG = [
    '-c',
    'user.name=nzyme test',
    '-c',
    'user.email=test@nzyme.invalid',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'init.defaultBranch=main',
    '-c',
    'protocol.file.allow=always',
];
const HERMETIC_GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const tmpDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', [...GIT_CONFIG, ...args], { cwd, env: HERMETIC_GIT_ENV, encoding: 'utf8' }).trim();
}

async function write(repo: string, file: string, content = file): Promise<void> {
    await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await fs.writeFile(path.join(repo, file), content);
}

const DEFAULT_FILES: Record<string, string> = { 'README.md': 'readme' };

async function createRepo(files?: Record<string, string>): Promise<string> {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-')));
    tmpDirs.push(dir);
    git(dir, 'init', '-q');
    for (const [file, content] of Object.entries(files ?? DEFAULT_FILES)) {
        await write(dir, file, content);
    }
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'initial');
    return dir;
}

function commitFile(repo: string, file: string, message = file): string {
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
}

test('collects modified, added, staged, deleted, renamed and untracked files against the merge-base', async () => {
    const repo = await createRepo({
        'a.ts': 'a',
        'modified.ts': 'm',
        'deleted.ts': 'd',
        'renamed-old.ts': 'a rather long body so that git detects the rename '.repeat(5),
        'unstaged.ts': 'u',
        'dir/ignored-by-gitignore.log': 'x',
        '.gitignore': '*.log\n',
    });
    const base = git(repo, 'rev-parse', 'HEAD');

    await write(repo, 'modified.ts', 'changed');
    await write(repo, 'committed-new.ts');
    commitFile(repo, 'x');
    await fs.rm(path.join(repo, 'deleted.ts'));
    git(repo, 'mv', 'renamed-old.ts', 'renamed-new.ts');
    await write(repo, 'staged.ts');
    git(repo, 'add', 'staged.ts');
    await write(repo, 'unstaged.ts', 'edited');
    await write(repo, 'sub dir/untracked.ts');
    await write(repo, 'ignored.log');

    expect(await collectChangedFiles({ root: repo, mergeBase: base })).toEqual([
        { path: 'committed-new.ts', deleted: false },
        { path: 'deleted.ts', deleted: true },
        { path: 'modified.ts', deleted: false },
        { path: 'renamed-new.ts', deleted: false },
        { path: 'renamed-old.ts', deleted: true },
        { path: 'staged.ts', deleted: false },
        { path: 'sub dir/untracked.ts', deleted: false },
        { path: 'unstaged.ts', deleted: false },
    ]);
});

test('a commit that is part of the base is not listed', async () => {
    const repo = await createRepo();
    await write(repo, 'before.ts');
    const base = commitFile(repo, 'before');

    expect(await collectChangedFiles({ root: repo, mergeBase: base })).toEqual([]);
});

async function createRepoWithSubmodule(): Promise<{ repo: string; upstream: string }> {
    const upstream = await createRepo({ 'lib.ts': 'lib', 'old.ts': 'old' });
    const repo = await createRepo({ 'app.ts': 'app' });
    git(repo, 'submodule', 'add', '-q', upstream, 'libs/sub');
    commitFile(repo, 'add submodule');
    return { repo, upstream };
}

test('submodule changes are diffed against the gitlink of the base, with the path prefixed', async () => {
    const { repo } = await createRepoWithSubmodule();
    const base = git(repo, 'rev-parse', 'HEAD');
    const sub = path.join(repo, 'libs/sub');

    await write(sub, 'lib.ts', 'changed');
    await write(sub, 'added.ts');
    await fs.rm(path.join(sub, 'old.ts'));
    git(sub, 'add', '-A');
    git(sub, 'commit', '-q', '-m', 'sub change');
    await write(sub, 'untracked.ts');
    git(repo, 'add', 'libs/sub');
    await write(repo, 'app.ts', 'changed');

    expect(await collectChangedFiles({ root: repo, mergeBase: base })).toEqual([
        { path: 'app.ts', deleted: false },
        { path: 'libs/sub/added.ts', deleted: false },
        { path: 'libs/sub/lib.ts', deleted: false },
        { path: 'libs/sub/old.ts', deleted: true },
        { path: 'libs/sub/untracked.ts', deleted: false },
    ]);
});

test('a submodule change already recorded in the base is not listed', async () => {
    const { repo } = await createRepoWithSubmodule();
    const sub = path.join(repo, 'libs/sub');
    await write(sub, 'lib.ts', 'changed');
    git(sub, 'add', '-A');
    git(sub, 'commit', '-q', '-m', 'sub change');
    const base = commitFile(repo, 'bump submodule');

    expect(await collectChangedFiles({ root: repo, mergeBase: base })).toEqual([]);
});

test('a submodule that did not exist in the base counts as entirely new', async () => {
    const repo = await createRepo({ 'app.ts': 'app' });
    const base = git(repo, 'rev-parse', 'HEAD');
    const upstream = await createRepo({ 'lib.ts': 'lib' });
    git(repo, 'submodule', 'add', '-q', upstream, 'libs/sub');
    commitFile(repo, 'add submodule');

    const files = await collectChangedFiles({ root: repo, mergeBase: base });
    expect(files.map(file => file.path)).toEqual(['.gitmodules', 'libs/sub/lib.ts']);
});

test('an uninitialised submodule is skipped, unless its commit changed since the base', async () => {
    const { repo, upstream } = await createRepoWithSubmodule();
    const base = git(repo, 'rev-parse', 'HEAD');
    const clone = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-clone-')));
    tmpDirs.push(clone);
    git(clone, 'clone', '-q', repo, 'work');
    const work = path.join(clone, 'work');

    // Not initialised (empty dir), gitlink unchanged: nothing to report, and no leak from the parent repo.
    await write(work, 'app.ts', 'changed');
    expect(await collectChangedFiles({ root: work, mergeBase: base })).toEqual([{ path: 'app.ts', deleted: false }]);

    // Gitlink moved while the checkout is missing: the change is invisible, so refuse.
    await write(upstream, 'lib.ts', 'newer');
    const newer = commitFile(upstream, 'newer');
    git(work, 'update-index', '--cacheinfo', `160000,${newer},libs/sub`);
    git(work, 'commit', '-q', '-m', 'bump');
    await expect(collectChangedFiles({ root: work, mergeBase: base })).rejects.toThrow(/not checked out/);
});

test('an unknown merge-base throws instead of returning an empty list', async () => {
    const repo = await createRepo();
    await expect(collectChangedFiles({ root: repo, mergeBase: 'deadbeef' })).rejects.toThrow();
});
