import { writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, setDefaultTimeout, test } from 'bun:test';

import { bumpSubmodule } from './bumpSubmodule.js';
import { mirrorSubmoduleRef } from './mirrorSubmoduleRef.js';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

// Every test builds real repositories (a bare "nzyme" remote and a "product" using it as a submodule).
setDefaultTimeout(60_000);

/**
 * Passed to every git call the tests make themselves: an identity (CI runners have no global one),
 * no signing (a developer's global config may require it), `main` as the initial branch, and
 * `protocol.file.allow` — modern git refuses `submodule add` from a local path without it.
 */
const GIT_CONFIG = [
    '-c',
    'user.name=nzyme test',
    '-c',
    'user.email=test@nzyme.invalid',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
    '-c',
    'init.defaultBranch=main',
    '-c',
    'protocol.file.allow=always',
];

/** Environment for git and the CLI: no global or system git config — as on a CI runner. */
const HERMETIC_GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const CONSUMER_MAIN = 'healed/main';

test('mirror creates a missing consumer ref at the pinned commit', async () => {
    const fixture = await createFixture();

    const result = await mirror(fixture);

    expect(result).toEqual({ action: 'create', gitlink: fixture.initial, previous: null, pushed: true });
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBe(fixture.initial);
});

test('mirror leaves a ref that already matches alone', async () => {
    const fixture = await createFixture();
    await mirror(fixture);

    const result = await mirror(fixture);

    expect(result.action).toBe('noop');
    expect(result.pushed).toBe(false);
});

test('mirror fast-forwards the ref to a descendant pin', async () => {
    const fixture = await createFixture();
    await mirror(fixture);
    const next = commitUpstream(fixture, 'feat: next');
    pin(fixture, next);

    const result = await mirror(fixture);

    expect(result).toEqual({ action: 'fast-forward', gitlink: next, previous: fixture.initial, pushed: true });
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBe(next);
});

test('mirror refuses a rollback and leaves the ref untouched', async () => {
    const fixture = await createFixture();
    const next = commitUpstream(fixture, 'feat: next');
    pin(fixture, next);
    await mirror(fixture);
    pin(fixture, fixture.initial);

    const result = await mirror(fixture);

    expect(result).toEqual({ action: 'rollback', gitlink: fixture.initial, previous: next, pushed: false });
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBe(next);
});

test('mirror refuses a diverged pin and leaves the ref untouched', async () => {
    const fixture = await createFixture();
    const next = commitUpstream(fixture, 'feat: next');
    pin(fixture, next);
    await mirror(fixture);
    // A commit made in the product's submodule on top of the initial one, never pushed anywhere.
    git(fixture.submodule, 'checkout', '--quiet', '--detach', fixture.initial);
    const side = commitIn(fixture.submodule, 'feat: side');
    pin(fixture, side);

    const result = await mirror(fixture);

    expect(result).toEqual({ action: 'diverged', gitlink: side, previous: next, pushed: false });
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBe(next);
});

test('mirror in a dry run decides but pushes nothing', async () => {
    const fixture = await createFixture();

    const result = await mirror(fixture, { dryRun: true });

    expect(result.action).toBe('create');
    expect(result.pushed).toBe(false);
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBeNull();
});

test('mirror unshallows the submodule so a fast-forward is recognised', async () => {
    const fixture = await createFixture();
    await mirror(fixture);
    const next = commitUpstream(fixture, 'feat: next');
    pin(fixture, next);
    // Cut the history below `next`, as a depth-1 CI checkout does.
    git(fixture.submodule, 'fetch', '--quiet', '--depth=1', 'origin', 'main');
    expect(git(fixture.submodule, 'rev-parse', '--is-shallow-repository')).toBe('true');

    const result = await mirror(fixture);

    expect(result.action).toBe('fast-forward');
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBe(next);
});

test('mirror rejects a path that is not a submodule', async () => {
    const fixture = await createFixture();

    const mirrored = mirrorSubmoduleRef({
        repoDir: fixture.product,
        submodulePath: 'package.json',
        targetBranch: CONSUMER_MAIN,
        remote: 'origin',
        dryRun: false,
    });

    await expect(mirrored).rejects.toThrow('"package.json" is not a submodule at HEAD');
});

test('the mirror command exits 1 on a refusal and names both commits', async () => {
    const fixture = await createFixture();
    const next = commitUpstream(fixture, 'feat: next');
    pin(fixture, next);
    await mirror(fixture);
    pin(fixture, fixture.initial);

    const result = await runCli(fixture.product, ['submodule', 'mirror', '--consumer', 'healed', '--branch', 'main']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('healed/main was left untouched');
    expect(result.stderr).toContain(next);
    expect(result.stderr).toContain(fixture.initial);
    expect(remoteBranch(fixture, CONSUMER_MAIN)).toBe(next);
});

test('bump moves the submodule to the source, stages it and summarises the new commits', async () => {
    const fixture = await createFixture();
    const first = commitUpstream(fixture, 'feat: first (#12)');
    const second = commitUpstream(fixture, 'fix: second');

    const bump = await bumpSubmodule({
        repoDir: fixture.product,
        submodulePath: 'nzyme',
        source: 'origin/main',
        remote: 'origin',
    });

    expect(bump).toMatchObject({ changed: true, previous: fixture.initial, current: second, droppedCount: 0 });
    expect(bump.changed && bump.commits.map(commit => commit.sha)).toEqual([second, first]);
    expect(git(fixture.product, 'diff', '--cached', '--name-only')).toBe('nzyme');
    expect(git(fixture.submodule, 'rev-parse', 'HEAD')).toBe(second);
    // Staged only: the product's HEAD still pins the old commit.
    expect(git(fixture.product, 'ls-tree', 'HEAD', 'nzyme')).toContain(fixture.initial);
});

test('bump resolves a tag', async () => {
    const fixture = await createFixture();
    const tagged = commitUpstream(fixture, 'feat: tagged');
    git(fixture.upstream, 'tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
    git(fixture.upstream, 'push', '--quiet', 'origin', 'v1.0.0');
    commitUpstream(fixture, 'feat: after the tag');

    const bump = await bumpSubmodule({
        repoDir: fixture.product,
        submodulePath: 'nzyme',
        source: 'v1.0.0',
        remote: 'origin',
    });

    expect(bump).toMatchObject({ changed: true, current: tagged });
});

test('the bump command prints a summary and writes the summary file', async () => {
    const fixture = await createFixture();
    const next = commitUpstream(fixture, 'feat: next');

    const result = await runCli(fixture.product, [
        'submodule',
        'bump',
        '--source',
        'origin/main',
        '--summary-file',
        'out/summary.md',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`\`${fixture.initial.slice(0, 7)}\` → \`${next.slice(0, 7)}\``);
    expect(result.stdout).toContain(`- \`${next.slice(0, 7)}\` feat: next`);
    expect(await fs.readFile(path.join(fixture.product, 'out/summary.md'), 'utf8')).toBe(result.stdout);
});

test('the bump command prints exactly "unchanged" when the submodule is already at the source', async () => {
    const fixture = await createFixture();

    const result = await runCli(fixture.product, [
        'submodule',
        'bump',
        '--source',
        'origin/main',
        '--summary-file',
        'summary.md',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('unchanged\n');
    expect(git(fixture.product, 'status', '--porcelain')).toBe('');
    expect(await Bun.file(path.join(fixture.product, 'summary.md')).exists()).toBe(false);
});

interface Fixture {
    /** The bare repository standing in for nzyme on GitHub. */
    remote: string;
    /** A clone of the remote, used to author nzyme commits as a developer would. */
    upstream: string;
    /** The product repository, with the remote as its `nzyme` submodule. */
    product: string;
    /** The product's submodule checkout. */
    submodule: string;
    /** The nzyme commit the product pins initially (and the remote's `main`). */
    initial: string;
}

/** A bare nzyme remote with one commit on `main`, and a product pinning that commit as `nzyme`. */
async function createFixture(): Promise<Fixture> {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-submodule-')));
    const remote = path.join(root, 'nzyme.git');
    const upstream = path.join(root, 'upstream');
    const product = path.join(root, 'product');

    git(root, 'init', '--quiet', '--bare', remote);
    git(root, 'clone', '--quiet', remote, upstream);
    const initial = commitIn(upstream, 'feat: initial');
    git(upstream, 'push', '--quiet', 'origin', 'HEAD:main');

    git(root, 'init', '--quiet', product);
    await fs.writeFile(path.join(product, 'package.json'), '{ "name": "product" }\n');
    git(product, 'add', 'package.json');
    git(product, 'commit', '--quiet', '-m', 'chore: init');
    git(product, 'submodule', '--quiet', 'add', remote, 'nzyme');
    git(product, 'commit', '--quiet', '-m', 'chore: add nzyme');

    return { remote, upstream, product, submodule: path.join(product, 'nzyme'), initial };
}

/** Mirrors the product's pin to `healed/main`. */
async function mirror(fixture: Fixture, options: { dryRun?: boolean } = {}) {
    return await mirrorSubmoduleRef({
        repoDir: fixture.product,
        submodulePath: 'nzyme',
        targetBranch: CONSUMER_MAIN,
        remote: 'origin',
        dryRun: options.dryRun ?? false,
    });
}

/** Commits on nzyme's `main` and pushes it to the remote; returns the commit. */
function commitUpstream(fixture: Fixture, message: string): string {
    const sha = commitIn(fixture.upstream, message);
    git(fixture.upstream, 'push', '--quiet', 'origin', 'HEAD:main');
    return sha;
}

/** Moves the product's submodule to a commit and commits that pin in the product. */
function pin(fixture: Fixture, sha: string): void {
    git(fixture.submodule, 'fetch', '--quiet', 'origin');
    git(fixture.submodule, 'checkout', '--quiet', '--detach', sha);
    git(fixture.product, 'add', 'nzyme');
    git(fixture.product, 'commit', '--quiet', '-m', `chore: pin nzyme to ${sha}`);
}

/** Makes a commit with a fresh file in a repository; returns the commit. */
function commitIn(repo: string, message: string): string {
    const file = `${message.replaceAll(/\W+/g, '-')}.txt`;
    writeFileSync(path.join(repo, file), `${message}\n`);
    git(repo, 'add', file);
    git(repo, 'commit', '--quiet', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
}

/** Where a branch points on the bare remote, or `null` when it does not exist. */
function remoteBranch(fixture: Fixture, branch: string): string | null {
    const result = spawnGit(fixture.remote, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    return result.exitCode === 0 ? result.stdout.toString().trim() : null;
}

/** Runs git with {@link GIT_CONFIG}; returns trimmed stdout and throws on failure. */
function git(cwd: string, ...args: string[]): string {
    const result = spawnGit(cwd, args);
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${result.stderr.toString()}`);
    }

    return result.stdout.toString().trim();
}

/**
 * Runs git with {@link GIT_CONFIG}, whatever its exit code. Global and system config are ignored, so
 * a run on a developer machine proves the same as one on a CI runner with no git identity.
 */
function spawnGit(cwd: string, args: string[]) {
    return Bun.spawnSync(['git', ...GIT_CONFIG, ...args], { cwd, env: HERMETIC_GIT_ENV });
}

/** Runs the nzyme CLI from source in a directory. */
async function runCli(cwd: string, args: string[]) {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, ...args], {
        cwd,
        env: HERMETIC_GIT_ENV,
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
