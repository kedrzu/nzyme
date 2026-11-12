import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

// Every test spawns the CLI against a real git repository.
setDefaultTimeout(60_000);

const HERMETIC_GIT_ENV = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'nzyme test',
    GIT_AUTHOR_EMAIL: 'test@nzyme.invalid',
    GIT_COMMITTER_NAME: 'nzyme test',
    GIT_COMMITTER_EMAIL: 'test@nzyme.invalid',
};

/** A repo with `origin/main` at the first commit and `origin/release` at the second, `HEAD` one ahead. */
let repo = '';
let release = '';

beforeAll(async () => {
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-git-base-command-')));
    await fs.writeFile(
        path.join(repo, 'package.json'),
        JSON.stringify({ name: 'fixture', private: true, nzyme: { affected: { baseBranches: ['main', 'release'] } } }),
    );

    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'first');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'second');
    git('update-ref', 'refs/remotes/origin/release', 'HEAD');
    release = git('rev-parse', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'third');
});

afterAll(async () => {
    await fs.rm(repo, { recursive: true, force: true });
});

test('prints the nearest configured base branch on stdout and its source on stderr', async () => {
    const result = await runGitBase([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('origin/release\n');
    expect(result.stderr).toContain(`origin/release (auto, merge-base ${release.slice(0, 10)})`);
});

test('an explicit base is printed as given', async () => {
    const long = await runGitBase(['--base', 'origin/main']);
    const short = await runGitBase(['-b', 'origin/main']);

    expect(long.stdout).toBe('origin/main\n');
    expect(short.stdout).toBe('origin/main\n');
    expect(short.stderr).toContain('(explicit,');
});

test('a base that cannot be resolved fails with nothing on stdout', async () => {
    const result = await runGitBase(['--base', 'origin/nope']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('origin/nope');
});

async function runGitBase(args: string[]) {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'git', 'base', ...args], {
        cwd: repo,
        env: { ...HERMETIC_GIT_ENV, GITHUB_ACTIONS: '' },
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return { stdout, stderr, exitCode };
}

function git(...args: string[]): string {
    return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
        cwd: repo,
        env: HERMETIC_GIT_ENV,
        encoding: 'utf8',
    }).trim();
}
