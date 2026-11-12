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

/**
 * A bun workspace with two packages: `@fix/beta` imports `@fix/alpha` through its `exports`. After the
 * base commit `alpha/src/value.ts` changes, which its own test and `beta/src/uses.test.ts` import;
 * `beta/src/unrelated.test.ts` imports nothing that changed. `beta/src/Messages.loc.ts` is gitignored,
 * generated from `Messages.loc.yaml` (a `rewrites` rule) and imported by `beta/src/messages.test.ts`.
 */
let repo = '';
let outDir = '';

beforeAll(async () => {
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-command-')));
    outDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-out-')));

    await write('bun.lock', '');
    await write(
        'package.json',
        JSON.stringify({
            name: 'fixture',
            private: true,
            workspaces: ['packages/*'],
            nzyme: { affected: { rewrites: [{ from: '.loc.yaml', to: '.loc.ts' }] } },
        }),
    );
    await write('.gitignore', '*.loc.ts\n');
    await write(
        'packages/alpha/package.json',
        JSON.stringify({ name: '@fix/alpha', exports: { './*.js': { source: './src/*.ts' } } }),
    );
    await write('packages/alpha/src/value.ts', 'export const value = 1;\n');
    await write('packages/alpha/src/value.test.ts', "import { value } from './value.js';\n");
    await write('packages/beta/package.json', JSON.stringify({ name: '@fix/beta' }));
    await write('packages/beta/src/uses.test.ts', "import { value } from '@fix/alpha/value.js';\n");
    await write('packages/beta/src/other.ts', 'export const other = 2;\n');
    await write('packages/beta/src/unrelated.test.ts', "import { other } from './other.js';\n");
    await write('packages/beta/src/Messages.loc.yaml', 'hello: Hello\n');
    await write('packages/beta/src/Messages.loc.ts', "import type { Translation } from '@nzyme/i18n';\n");
    await write('packages/beta/src/messages.test.ts', "import { Messages } from './Messages.loc.js';\n");

    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    await write('packages/alpha/src/value.ts', 'export const value = 2;\n');
});

afterAll(async () => {
    await Promise.all([repo, outDir].map(dir => fs.rm(dir, { recursive: true, force: true })));
});

test('prints only the affected files on stdout and the chosen base on stderr', async () => {
    const result = await runAffected(['*.test.ts']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('packages/alpha/src/value.test.ts\npackages/beta/src/uses.test.ts\n');
    expect(result.stderr).toMatch(/base origin\/main \(auto, merge-base [0-9a-f]{10}\) · 1 changed files · 2 selected/);
});

test('passes the files to the command as arguments', async () => {
    const script = 'printf "%s\\n" "$@" > "$OUT/args.txt"';

    const result = await runAffected(['*.test.ts', '--', 'sh', '-c', script, 'sh']);

    const files = 'packages/alpha/src/value.test.ts\npackages/beta/src/uses.test.ts';
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(await fs.readFile(path.join(outDir, 'args.txt'), 'utf8')).toBe(`${files}\n`);
});

test('--per-package runs the command in each package with paths relative to it', async () => {
    const log = path.join(outDir, 'per-package.txt');
    const script = 'echo "$PWD|$*" >> "$OUT/per-package.txt"';

    const result = await runAffected(['--per-package', '*.test.ts', '--', 'sh', '-c', script, 'sh']);

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(log, 'utf8')).toBe(
        `${repo}/packages/alpha|src/value.test.ts\n${repo}/packages/beta|src/uses.test.ts\n`,
    );
});

test('--per-package runs every package after a failure and exits with the first non-zero code', async () => {
    const script = 'echo "$PWD" >> "$OUT/failing.txt"; case "$PWD" in *alpha) exit 3;; *) exit 5;; esac';

    const result = await runAffected(['*.test.ts', '--per-package', '--', 'sh', '-c', script]);

    expect(result.exitCode).toBe(3);
    expect(await fs.readFile(path.join(outDir, 'failing.txt'), 'utf8')).toBe(
        `${repo}/packages/alpha\n${repo}/packages/beta\n`,
    );
});

test('a changed file selects the importers of its gitignored rewrite target', async () => {
    const yaml = path.join(repo, 'packages/beta/src/Messages.loc.yaml');
    await fs.writeFile(yaml, 'hello: Hi\n');
    try {
        const result = await runAffected(['*.test.ts']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe(
            'packages/alpha/src/value.test.ts\npackages/beta/src/messages.test.ts\npackages/beta/src/uses.test.ts\n',
        );
    } finally {
        await fs.writeFile(yaml, 'hello: Hello\n');
    }
});

test('the exit code of a failing command is passed through', async () => {
    const result = await runAffected(['*.test.ts', '--', 'sh', '-c', 'exit 4']);

    expect(result.exitCode).toBe(4);
});

test('an empty selection does not run the command and exits 0', async () => {
    const result = await runAffected(['*.stories.tsx', '--', 'sh', '-c', 'touch "$OUT/ran"']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('no affected files\n');
    expect(await fs.exists(path.join(outDir, 'ran'))).toBe(false);
});

test('-b names the base like --base', async () => {
    const result = await runAffected(['-b', 'origin/main', '*.test.ts']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('base origin/main (explicit,');
});

test('a missing base fails instead of selecting nothing', async () => {
    const result = await runAffected(['--base', 'origin/nope', '*.test.ts']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('origin/nope');
});

async function runAffected(args: string[]) {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'git', 'affected', ...args], {
        cwd: repo,
        env: { ...HERMETIC_GIT_ENV, OUT: outDir, GITHUB_ACTIONS: '' },
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

async function write(file: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await fs.writeFile(path.join(repo, file), content);
}
