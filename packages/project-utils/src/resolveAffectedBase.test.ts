import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';

import { resolveAffectedBase } from './resolveAffectedBase.js';

// Every test builds a real git repository.
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
];
const HERMETIC_GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const tmpDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', [...GIT_CONFIG, ...args], { cwd, env: HERMETIC_GIT_ENV, encoding: 'utf8' }).trim();
}

async function write(repo: string, file: string): Promise<void> {
    await fs.writeFile(path.join(repo, file), file);
}

async function createRepo(): Promise<string> {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-base-')));
    tmpDirs.push(dir);
    git(dir, 'init', '-q');
    await write(dir, 'README.md');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'initial');
    return dir;
}

/** Simulates a remote-tracking branch without a remote. */
function setOrigin(repo: string, name: string, sha: string): void {
    git(repo, 'update-ref', `refs/remotes/origin/${name}`, sha);
}

function commitFile(repo: string, message: string): string {
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
}

const NO_ENV = {};

test('auto picks the candidate with the fewest commits since its merge-base', async () => {
    const repo = await createRepo();
    const root = git(repo, 'rev-parse', 'HEAD');
    await write(repo, 'one.ts');
    const release = commitFile(repo, 'one');
    await write(repo, 'two.ts');
    commitFile(repo, 'two');
    setOrigin(repo, 'main', root);
    setOrigin(repo, 'release', release);

    expect(await resolveAffectedBase({ root: repo, baseBranches: ['main', 'release'], env: NO_ENV })).toEqual({
        ref: 'origin/release',
        mergeBase: release,
        source: 'auto',
    });
});

test('auto breaks ties by candidate order and skips candidates that do not exist', async () => {
    const repo = await createRepo();
    const root = git(repo, 'rev-parse', 'HEAD');
    setOrigin(repo, 'develop', root);
    setOrigin(repo, 'main', root);

    const base = await resolveAffectedBase({ root: repo, baseBranches: ['missing', 'develop', 'main'], env: NO_ENV });
    expect(base.ref).toBe('origin/develop');
});

test('auto throws naming the candidates when none exists', async () => {
    const repo = await createRepo();
    await expect(resolveAffectedBase({ root: repo, baseBranches: ['main', 'dev'], env: NO_ENV })).rejects.toThrow(
        /origin\/main, origin\/dev/,
    );
});

test('the explicit base beats GitHub Actions and auto', async () => {
    const repo = await createRepo();
    const first = git(repo, 'rev-parse', 'HEAD');
    await write(repo, 'one.ts');
    const second = commitFile(repo, 'one');
    await write(repo, 'two.ts');
    commitFile(repo, 'two');
    setOrigin(repo, 'main', second);
    const env = { GITHUB_ACTIONS: 'true', GITHUB_BASE_REF: 'main' };

    expect(await resolveAffectedBase({ root: repo, base: first, baseBranches: ['main'], env })).toEqual({
        ref: first,
        mergeBase: first,
        source: 'explicit',
    });
});

test('an explicit ref that does not exist throws', async () => {
    const repo = await createRepo();
    await expect(
        resolveAffectedBase({ root: repo, base: 'origin/nope', baseBranches: ['main'], env: NO_ENV }),
    ).rejects.toThrow(/origin\/nope/);
});

test('GitHub pull_request uses origin/<GITHUB_BASE_REF>', async () => {
    const repo = await createRepo();
    const root = git(repo, 'rev-parse', 'HEAD');
    await write(repo, 'one.ts');
    commitFile(repo, 'one');
    setOrigin(repo, 'main', root);
    setOrigin(repo, 'release', root);

    const base = await resolveAffectedBase({
        root: repo,
        baseBranches: ['main'],
        env: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'release' },
    });
    expect(base).toEqual({ ref: 'origin/release', mergeBase: root, source: 'github-pr' });
});

test('GitHub push uses the event before sha; an all-zero before falls through to auto', async () => {
    const repo = await createRepo();
    const root = git(repo, 'rev-parse', 'HEAD');
    await write(repo, 'one.ts');
    commitFile(repo, 'one');
    setOrigin(repo, 'main', root);
    const eventPath = path.join(repo, '..', `event-${path.basename(repo)}.json`);
    const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventPath };

    await fs.writeFile(eventPath, JSON.stringify({ before: root }));
    expect(await resolveAffectedBase({ root: repo, baseBranches: ['main'], env })).toEqual({
        ref: root,
        mergeBase: root,
        source: 'github-push',
    });

    await fs.writeFile(eventPath, JSON.stringify({ before: '0'.repeat(40) }));
    expect(await resolveAffectedBase({ root: repo, baseBranches: ['main'], env })).toMatchObject({
        ref: 'origin/main',
        source: 'auto',
    });
    await fs.rm(eventPath);
});
