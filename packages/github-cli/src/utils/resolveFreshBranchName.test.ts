import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

import { listTaskBranches } from './listTaskBranches.js';
import { resolveFreshBranchName } from './resolveFreshBranchName.js';

// Every test builds real git repositories, which outgrow the 5 s default under a loaded full run.
setDefaultTimeout(60_000);

const TASK = 'feature/abc-1-thing';

let root: string;
let clonePath: string;
let git: SimpleGit;

beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'resolve-fresh-branch-'));
    const remote = join(root, 'origin.git');
    clonePath = join(root, 'clone');

    await simpleGit().init(['--bare', remote]);
    await simpleGit(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await simpleGit().clone(remote, clonePath);
    git = simpleGit({ baseDir: clonePath, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await git.commit('c0', [], { '--allow-empty': null });
    await git.branch(['-M', 'main']);
    await git.push(['-u', 'origin', 'main']);
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('the first run of a task gets the plain branch name', async () => {
    expect(await resolveFreshBranchName({ branchName: TASK, baseDir: clonePath })).toBe(TASK);
});

test('a branch checked out in another worktree yields --v2, which can then be created from origin/main and pushed', async () => {
    await git.raw(['worktree', 'add', '-b', TASK, join(root, 'old-worktree'), 'origin/main']);
    await git.push(['origin', TASK]);

    const name = await resolveFreshBranchName({ branchName: TASK, baseDir: clonePath });

    expect(name).toBe(`${TASK}--v2`);
    await git.checkout(['-b', name, 'origin/main']);
    await git.push(['origin', name]);
    expect(await git.raw(['ls-remote', '--heads', 'origin', name])).toContain(`refs/heads/${name}`);
});

test('a branch that exists only on the remote yields --v2, even with a stale remote-tracking ref', async () => {
    const other = join(root, 'other');
    await simpleGit().clone(join(root, 'origin.git'), other);
    const otherGit = simpleGit({ baseDir: other, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await otherGit.checkout(['-b', TASK, 'origin/main']);
    await otherGit.push(['-u', 'origin', TASK]);

    // `clone` has not fetched since, so only the fetch inside the helper can see the branch.
    expect(await resolveFreshBranchName({ branchName: TASK, baseDir: clonePath })).toBe(`${TASK}--v2`);
});

test('re-running on the task branch itself reuses it', async () => {
    await git.checkout(['-b', TASK, 'origin/main']);
    await git.push(['-u', 'origin', TASK]);

    expect(await resolveFreshBranchName({ branchName: TASK, baseDir: clonePath })).toBe(TASK);
});

test('takes the next version after the highest existing one, and stack nodes are not versions', async () => {
    await git.branch([TASK, 'origin/main']);
    await git.branch([`${TASK}--s2`, 'origin/main']);
    await git.branch([`${TASK}--v2`, 'origin/main']);
    await git.branch([`${TASK}--v2--s3`, 'origin/main']);

    expect(await resolveFreshBranchName({ branchName: TASK, baseDir: clonePath })).toBe(`${TASK}--v3`);
});

test('a lone stack node does not make the plain name taken', async () => {
    await git.branch([`${TASK}--s2`, 'origin/main']);

    expect(await resolveFreshBranchName({ branchName: TASK, baseDir: clonePath })).toBe(TASK);
});

test('listTaskBranches returns only the task family, deduplicated across local and origin', async () => {
    await git.checkout(['-b', TASK, 'origin/main']);
    await git.push(['-u', 'origin', TASK]);
    await git.branch(['feature/abc-10-other', 'origin/main']);

    const branches = await listTaskBranches({ branchName: `${TASK}--v4`, baseDir: clonePath });

    expect(branches).toEqual([TASK]);
});
