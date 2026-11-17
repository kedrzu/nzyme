import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';

import type { TracedTestResult } from '@nzyme/affected/playwright/TracedTestResult.js';
import { openTestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import type { TestUnit } from '@nzyme/affected/store/VariantStore.js';

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
 * A fake test runner: `sh -c RUNNER sh <junit> <file…>` writes a JUnit report with one testcase per
 * file, failing the file named by `$FAIL` (and exiting 1), and appends the files to `$OUT/ran.txt`.
 */
const RUNNER = [
    'out="$1"; shift; code=0',
    '{ echo "<testsuites>"; for f in "$@"; do',
    '  if [ "$f" = "$FAIL" ]; then code=1; echo "<testsuite name=\\"$f\\" file=\\"$f\\"><testcase name=\\"t\\" file=\\"$f\\"><failure message=\\"x\\"/></testcase></testsuite>";',
    '  else echo "<testsuite name=\\"$f\\" file=\\"$f\\"><testcase name=\\"t\\" file=\\"$f\\"/></testsuite>"; fi',
    'done; echo "</testsuites>"; } > "$out"',
    'printf "%s\\n" "$@" >> "$OUT/ran.txt"; exit $code',
].join('\n');

const VALUE_TEST = 'packages/alpha/src/value.test.ts';
const TOP: TestUnit = { file: 'e2e/x.spec.ts', title: ['top'] };
const IN_GROUP: TestUnit = { file: 'e2e/x.spec.ts', title: ['grp', 'in'] };
const USES_TEST = 'packages/beta/src/uses.test.ts';

/**
 * A bun workspace with a static suite `unit` and a traced suite `e2e`. After the base commit
 * `alpha/src/value.ts` changes, which `value.test.ts` and `uses.test.ts` import;
 * `unrelated.test.ts` imports nothing that changed.
 */
let repo = '';
let outDir = '';

beforeEach(async () => {
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-suite-')));
    outDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-affected-suite-out-')));

    await write('bun.lock', '');
    await write(
        'package.json',
        JSON.stringify({
            name: 'fixture',
            private: true,
            workspaces: ['packages/*'],
            nzyme: {
                affected: {
                    suites: {
                        unit: { patterns: ['*.test.ts'] },
                        e2e: { patterns: ['e2e/**/*.spec.ts'], traced: true },
                    },
                },
            },
        }),
    );
    await write(
        'packages/alpha/package.json',
        JSON.stringify({ name: '@fix/alpha', exports: { './*.js': { source: './src/*.ts' } } }),
    );
    await write('packages/alpha/src/value.ts', 'export const value = 1;\n');
    await write(VALUE_TEST, "import { value } from './value.js';\n");
    await write('packages/beta/package.json', JSON.stringify({ name: '@fix/beta' }));
    await write(USES_TEST, "import { value } from '@fix/alpha/value.js';\n");
    await write('packages/beta/src/other.ts', 'export const other = 2;\n');
    await write('packages/beta/src/unrelated.test.ts', "import { other } from './other.js';\n");
    await write('e2e/x.spec.ts', "import { other } from '../packages/beta/src/other.js';\n");

    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    await write('packages/alpha/src/value.ts', 'export const value = 2;\n');
});

afterEach(async () => {
    await Promise.all([repo, outDir].map(dir => fs.rm(dir, { recursive: true, force: true })));
});

test('records the files that passed, skips them next time, and runs a failed one again', async () => {
    const first = await runSuite({ FAIL: VALUE_TEST });

    expect(first.exitCode).toBe(1);
    expect(first.stdout).toBe('');
    expect(first.stderr).toContain(
        'nzyme git affected --suite unit: 2 run (affected since base) · 1 skipped (unaffected since base)',
    );
    expect(first.stderr).toContain('recorded 1 · 1 failed (0 variants invalidated)');
    expect(await readRan()).toEqual([VALUE_TEST, USES_TEST]);

    const second = await runSuite({});

    expect(second.exitCode).toBe(0);
    expect(second.stderr).toContain(
        '1 run (affected since base) · 2 skipped (1 variant match; 1 unaffected since base)',
    );
    expect(await readRan()).toEqual([VALUE_TEST]);

    const third = await runSuite({});

    expect(third.exitCode).toBe(0);
    expect(third.stderr).toContain('0 run · 3 skipped (2 variant match; 1 unaffected since base)');
    expect(third.stderr).toContain('no affected files\n');
    expect(await readRan()).toEqual([]);
});

test('a change to a recorded dependency runs the test again, naming the file', async () => {
    await runSuite({});
    await write('packages/alpha/src/value.ts', 'export const value = 3;\n');

    const result = await runSuite({});

    expect(result.stderr).toContain('2 run (changed: packages/alpha/src/value.ts)');
});

test('without a command, prints the selected files on stdout', async () => {
    const result = await runAffected(['--suite', 'unit']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${VALUE_TEST}\n${USES_TEST}\n`);
});

test('--full runs every file, invalidates a failed one and reports that the selection skipped it', async () => {
    await runSuite({});

    const full = await runSuite({ FAIL: USES_TEST }, ['--full']);

    expect(full.exitCode).toBe(1);
    expect(await readRan()).toHaveLength(3);
    expect(full.stderr).toContain('1 failed (1 variants invalidated)');
    expect(full.stderr).toContain(`${USES_TEST} failed, yet the selection skipped it (variant)`);

    const next = await runSuite({});

    expect(next.stderr).toContain('1 run (affected since base)');
    expect(await readRan()).toEqual([USES_TEST]);
});

test('--per-package reads the report after each package, so every package records its files', async () => {
    // The runner sees paths relative to the package, as vitest reports them.
    const first = await runSuite({ FAIL: 'src/value.test.ts' }, ['--per-package']);

    expect(first.exitCode).toBe(1);
    expect(first.stderr).toContain('recorded 1 · 1 failed (0 variants invalidated)');
    expect(await readRan()).toEqual(['src/value.test.ts', 'src/uses.test.ts']);

    const second = await runSuite({}, ['--per-package']);

    expect(second.stderr).toContain(
        '1 run (affected since base) · 2 skipped (1 variant match; 1 unaffected since base)',
    );
    expect(await readRan()).toEqual(['src/value.test.ts']);
});

test('a run that writes no report does not record the previous one', async () => {
    const junit = path.join(outDir, 'junit.xml');
    await runSuite({});
    await write('packages/alpha/src/value.ts', 'export const value = 3;\n');

    const result = await runAffected(['--suite', 'unit', '--junit', junit, '--', 'sh', '-c', 'exit 0']);

    expect(result.stderr).toContain('no variants recorded, cannot read the JUnit report');
    expect((await runSuite({})).stderr).toContain('2 run (changed: packages/alpha/src/value.ts)');
});

test('an unreadable JUnit report records nothing, warns, and keeps the exit code', async () => {
    const junit = path.join(outDir, 'missing.xml');

    const result = await runAffected(['--suite', 'unit', '--junit', junit, '--', 'sh', '-c', 'exit 3']);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('no variants recorded, cannot read the JUnit report');
    expect((await runAffected(['--suite', 'unit'])).stdout).toBe(`${VALUE_TEST}\n${USES_TEST}\n`);
});

test('--units writes the selected single tests as a Playwright test list', async () => {
    const units = path.join(outDir, 'units.json');
    const out = path.join(outDir, 'selected.txt');
    await fs.writeFile(
        units,
        JSON.stringify({
            config: { rootDir: path.join(repo, 'e2e') },
            suites: [
                {
                    title: 'x.spec.ts',
                    file: 'x.spec.ts',
                    specs: [{ title: 'top', file: 'x.spec.ts' }],
                    suites: [{ title: 'grp', file: 'x.spec.ts', specs: [{ title: 'in', file: 'x.spec.ts' }] }],
                },
            ],
        }),
    );

    const first = await runAffected(['--suite', 'e2e', '--units', units, '--test-list-out', out]);

    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe('');
    expect(first.stderr).toContain('nzyme git affected --suite e2e: 2 run (no variant) · 0 skipped');
    expect(await fs.readFile(out, 'utf8')).toBe('x.spec.ts › top\nx.spec.ts › grp › in\n');

    const selector = await openTestSelector({ root: repo, suite: 'e2e' });
    const recorded = await selector.record(
        { file: 'e2e/x.spec.ts', title: ['top'] },
        { status: 'passed', entry: ['e2e/x.spec.ts'] },
    );
    expect(recorded).toEqual({ recorded: true });

    const second = await runAffected(['--suite', 'e2e', '--units', units, '--test-list-out', out]);

    expect(second.stderr).toContain('1 run (no variant) · 1 skipped (variant match)');
    expect(await fs.readFile(out, 'utf8')).toBe('x.spec.ts › grp › in\n');
});

test('--record makes variants of the complete passed tests, counts incomplete ones and refuses files edited since the selection', async () => {
    const select = await selectE2e();
    expect(select.stderr).toContain('2 run (no variant)');
    await writeResults([
        traced(TOP, ['packages/beta/src/other.ts']),
        { unit: IN_GROUP, status: 'passed', complete: false, reason: 'no-heartbeat' },
    ]);

    const record = await recordE2e();

    expect(record.exitCode).toBe(0);
    expect(record.stderr).toContain('nzyme git affected: recorded 1 · 1 not recorded (no-heartbeat: 1)');
    expect((await selectE2e()).stderr).toContain('1 run (no variant) · 1 skipped (variant match)');

    // Edited after the selection the snapshot holds: the run may have executed other code.
    await write('packages/beta/src/other.ts', 'export const other = 3;\n');
    await writeResults([traced(IN_GROUP, ['packages/beta/src/other.ts'])]);

    const edited = await recordE2e();

    expect(edited.stderr).toContain('recorded 0 · 1 not recorded (edited: 1)');
});

test('--record --full invalidates a failed test and reports the selection skipped it', async () => {
    await selectE2e();
    await writeResults([traced(TOP, ['packages/beta/src/other.ts'])]);
    await recordE2e();
    expect((await selectE2e()).stderr).toContain('1 skipped (variant match)');
    await writeResults([{ unit: TOP, status: 'failed' }]);

    const full = await recordE2e(['--full']);

    expect(full.exitCode).toBe(0);
    expect(full.stderr).toContain('1 failed (1 variants invalidated)');
    expect(full.stderr).toContain('tracing gap: e2e/x.spec.ts › top failed, yet the selection skipped it (variant)');
    expect((await selectE2e()).stderr).toContain('2 run (no variant) · 0 skipped');
});

test('--record without a readable snapshot records nothing and exits 0', async () => {
    await writeResults([traced(TOP, [])]);

    const record = await recordE2e();

    expect(record.exitCode).toBe(0);
    expect(record.stderr).toContain('no variants recorded, cannot read the snapshot');
});

test.each([
    [['--junit', 'j.xml', '*.test.ts'], '--junit needs --suite <name>.'],
    [['--suite', 'unit', '--junit', 'j.xml'], '--junit needs the command'],
    [['--suite', 'e2e', '--units', 'u.json'], '--units needs --test-list-out <file>.'],
    [['--suite', 'e2e', '--units', 'u.json', '--test-list-out', 'o.txt', '--', 'true'], '--units takes no patterns'],
    [['--suite', 'e2e', '--record', 'r.ndjson'], '--record needs --snapshot <file>'],
    [['--suite', 'e2e', '--record', 'r.ndjson', '--snapshot', 's.json', '*.spec.ts'], '--record takes no patterns'],
    [['--suite', 'unit', '--snapshot', 's.json'], '--snapshot needs --units <file> or --record <file>.'],
    [['--suite', 'nope'], 'Unknown test suite "nope"'],
])('%p is refused', async (args, message) => {
    const result = await runAffected(args);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toContain(message);
});

/** `--suite unit --junit` over the fake runner; clears `ran.txt` first. */
async function runSuite(env: Record<string, string>, extra: string[] = []) {
    await fs.rm(path.join(outDir, 'ran.txt'), { force: true });
    const junit = path.join(outDir, 'junit.xml');
    return await runAffected(
        ['--suite', 'unit', '--junit', junit, ...extra, '--', 'sh', '-c', RUNNER, 'sh', junit],
        env,
    );
}

async function readRan(): Promise<string[]> {
    const ran = await fs.readFile(path.join(outDir, 'ran.txt'), 'utf8').catch(() => '');
    return ran.split('\n').filter(line => line !== '');
}

async function runAffected(args: string[], env: Record<string, string> = {}) {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'git', 'affected', ...args], {
        cwd: repo,
        env: { ...HERMETIC_GIT_ENV, OUT: outDir, GITHUB_ACTIONS: '', ...env },
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

/** `--units` over `x.spec.ts` (tests {@link TOP} and {@link IN_GROUP}), writing the snapshot. */
async function selectE2e() {
    const units = path.join(outDir, 'units.json');
    await fs.writeFile(
        units,
        JSON.stringify({
            config: { rootDir: path.join(repo, 'e2e') },
            suites: [
                {
                    title: 'x.spec.ts',
                    file: 'x.spec.ts',
                    specs: [{ title: 'top', file: 'x.spec.ts' }],
                    suites: [{ title: 'grp', file: 'x.spec.ts', specs: [{ title: 'in', file: 'x.spec.ts' }] }],
                },
            ],
        }),
    );
    const out = path.join(outDir, 'selected.txt');
    return await runAffected([
        '--suite',
        'e2e',
        '--units',
        units,
        '--test-list-out',
        out,
        '--snapshot',
        snapshotFile(),
    ]);
}

async function recordE2e(extra: string[] = []) {
    return await runAffected(['--suite', 'e2e', '--record', resultsFile(), '--snapshot', snapshotFile(), ...extra]);
}

async function writeResults(results: TracedTestResult[]): Promise<void> {
    await fs.writeFile(resultsFile(), results.map(result => `${JSON.stringify(result)}\n`).join(''));
}

function traced(unit: TestUnit, executed: string[]): TracedTestResult {
    return { unit, status: 'passed', complete: true, entry: [unit.file], executed, startup: [], assets: [] };
}

function snapshotFile() {
    return path.join(outDir, 'snapshot.json');
}

function resultsFile() {
    return path.join(outDir, 'results.ndjson');
}
