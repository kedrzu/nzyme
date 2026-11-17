import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { Subprocess } from 'bun';

import type { TracedTestResult } from '@nzyme/affected/playwright/TracedTestResult.js';
import { VariantStore } from '@nzyme/affected/store/VariantStore.js';
import type { TestUnit } from '@nzyme/affected/store/VariantStore.js';

import type { TraceLine } from '../TraceLine.js';

// A real Playwright run on Node (Chromium, the `traceTest` fixture, `TraceReporter`) of a tiny
// project — a browser bundle with a source map, served by a Bun server started with the probe — between
// the selection and the recording of `nzyme git affected`.
setDefaultTimeout(120_000);

const srcDir = path.resolve(import.meta.dir, '..');
const CLI_PATH = path.resolve(import.meta.dir, '../../../cli/src/cli.ts');
const GREETS: TestUnit = { file: 'e2e/app.spec.ts', title: ['greets'] };
const OWN_CONTEXT: TestUnit = { file: 'e2e/app.spec.ts', title: ['labels a context the test creates'] };

let root: string;
let traceDir: string;
/** Run files outside the project, so writing them is no edit of it. */
let outDir: string;
let server: Subprocess<'ignore', 'pipe', 'inherit'>;
let origin: string;

beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'trace-playwright-')));
    traceDir = await mkdtemp(path.join(tmpdir(), 'trace-playwright-dir-'));
    outDir = await mkdtemp(path.join(tmpdir(), 'trace-playwright-out-'));
    await writeProject();

    const build = await Bun.build({
        entrypoints: [path.join(root, 'app/src/main.ts')],
        outdir: path.join(root, 'app/dist'),
        target: 'browser',
        sourcemap: 'linked',
    });
    expect(build.success).toBe(true);

    // The same `@playwright/test` for the spec and the fixture: the project links the package's own.
    await mkdir(path.join(root, 'node_modules/@playwright'), { recursive: true });
    await symlink(
        await realpath(path.join(import.meta.dir, '../../node_modules/@playwright/test')),
        path.join(root, 'node_modules/@playwright/test'),
    );
    for (const args of [
        ['init', '-q'],
        ['add', '.'],
        ['commit', '-qm', 'init'],
    ]) {
        execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    }

    server = Bun.spawn([process.execPath, path.join(root, 'server/server.js')], {
        cwd: root,
        env: {
            ...process.env,
            BUN_OPTIONS: `--preload=${path.join(srcDir, 'probe/preload.ts')}`,
            NZYME_TRACE_DIR: traceDir,
        },
        stdout: 'pipe',
        stderr: 'inherit',
    });
    origin = await readOrigin(server);
});

afterAll(async () => {
    server.kill();
    await server.exited;
    await rm(root, { recursive: true, force: true });
    await rm(traceDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
});

test('a traced run writes what each passed test ran and fetched, and --record makes variants of them', async () => {
    const run = await runE2e({});

    expect(run.playwright.exitCode).toBe(0);
    const results = await readResults();
    expect(results.map(result => [result.unit, result.status, 'complete' in result && result.complete])).toEqual([
        [GREETS, 'passed', true],
        [OWN_CONTEXT, 'passed', true],
    ]);
    expect(results[0]).toMatchObject({ entry: ['e2e/app.spec.ts'], assets: ['app/public/img/logo.svg'] });
    expect(run.record.stderr).toContain('nzyme git affected: recorded 2');
    expect(run.record.exitCode).toBe(0);

    const greets = await readVariantFiles(GREETS);
    // Ran in the first page before the test navigated away: its coverage survives the navigation.
    expect(greets['app/src/label.ts']).toHaveProperty('body');
    expect(greets['app/src/main.ts']).toHaveProperty('body');
    // Imported by code that ran, never called itself.
    expect(greets['app/src/unused.ts']).not.toHaveProperty('body');
    expect(greets['server/greet.js']).toHaveProperty('body');
    expect(greets).toHaveProperty(['app/public/img/logo.svg']);
    // Imported by the server's entry, which ran, but called only by the other test.
    expect(greets['server/other.js']).not.toHaveProperty('body');

    const ownContext = await readVariantFiles(OWN_CONTEXT);
    expect(ownContext['server/other.js']).toHaveProperty('body');
    expect(ownContext['server/greet.js']).not.toHaveProperty('body');

    // Both tests' labels reached the server: the `context` fixture's and the one the test created.
    expect(await readServerLabels('server/greet.js')).toHaveLength(1);
    expect(await readServerLabels('server/other.js')).toHaveLength(1);
    expect(await readServerLabels('server/greet.js')).not.toEqual(await readServerLabels('server/other.js'));
});

test('a failed test is written as failed: --record invalidates its variant and --full reports a tracing gap', async () => {
    const run = await runE2e({ FAIL: '1' });

    expect(run.playwright.exitCode).toBe(1);
    expect((await readResults()).find(result => result.unit.title?.[0] === 'greets')).toEqual({
        unit: GREETS,
        status: 'failed',
    });
    expect(run.record.stderr).toContain('1 failed (1 variants invalidated)');
    expect(run.record.stderr).toContain('tracing gap: e2e/app.spec.ts › greets failed, yet the selection skipped it');

    const store = await VariantStore.open(root, 'e2e');
    expect(await store.read(GREETS)).toEqual([]);
    expect(await store.read(OWN_CONTEXT)).not.toEqual([]);
});

/**
 * The three steps of a traced e2e run: select (listing the tests, snapshotting what the selection
 * saw), run everything with Playwright on Node, as a consumer does, and record a full run.
 */
async function runE2e(env: Record<string, string>) {
    const playwrightCli = await realpath(path.join(root, 'node_modules/@playwright/test/cli.js'));
    const e2eEnv = {
        ...process.env,
        APP_ORIGIN: origin,
        TRACE_DIR: traceDir,
        SRC_DIR: srcDir,
        RESULTS_FILE: resultsFile(),
        // The fixture and reporter import nzyme packages: from their sources, not a build.
        NODE_OPTIONS: '--conditions=source',
        ...env,
    };
    const e2eDir = path.join(root, 'e2e');
    const units = path.join(outDir, 'units.json');

    const list = await spawnStep(['node', playwrightCli, 'test', '--list', '--reporter=json'], e2eDir, e2eEnv);
    await writeFile(units, list.stdout);
    const snapshot = path.join(outDir, 'snapshot.json');
    const affected = [process.execPath, '--conditions=source', CLI_PATH, 'git', 'affected', '--suite', 'e2e'];
    const select = await spawnStep(
        [...affected, '--units', units, '--test-list-out', path.join(outDir, 'selected.txt'), '--snapshot', snapshot],
        root,
    );
    expect(select.exitCode).toBe(0);

    const playwright = await spawnStep(['node', playwrightCli, 'test'], e2eDir, e2eEnv);
    const record = await spawnStep([...affected, '--record', resultsFile(), '--snapshot', snapshot, '--full'], root);
    return { playwright, record };
}

async function spawnStep(command: string[], cwd: string, env: Record<string, string | undefined> = process.env) {
    const child = Bun.spawn(command, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return { stdout, stderr, exitCode };
}

function resultsFile() {
    return path.join(outDir, 'results.ndjson');
}

async function readResults(): Promise<TracedTestResult[]> {
    return (await readFile(resultsFile(), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as TracedTestResult);
}

async function readVariantFiles(unit: TestUnit) {
    const store = await VariantStore.open(root, 'e2e');
    const [stored] = await store.read(unit);
    expect(stored).toBeDefined();
    return stored!.variant.files;
}

/** The distinct labels the server ran `file` under. */
async function readServerLabels(file: string): Promise<(string | null)[]> {
    const labels = new Set<string | null>();
    for (const name of await readdir(traceDir)) {
        const fileIds = new Set<number>();
        const lines = (await readFile(path.join(traceDir, name), 'utf8')).split('\n').filter(Boolean);
        for (const line of lines.map(each => JSON.parse(each) as TraceLine)) {
            if (line.type !== 'flush') {
                continue;
            }
            for (const [id, source] of line.files) {
                if (source === file) {
                    fileIds.add(id);
                }
            }
            for (const [, label, ids] of line.hits) {
                if (ids.some(id => fileIds.has(id))) {
                    labels.add(label);
                }
            }
        }
    }
    return [...labels];
}

async function readOrigin(child: Subprocess<'ignore', 'pipe', 'inherit'>): Promise<string> {
    let output = '';
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
        output += decoder.decode(chunk);
        const port = /PORT=(\d+)/.exec(output)?.[1];
        if (port) {
            return `http://localhost:${port}`;
        }
    }
    throw new Error(`The traced server exited before listening: ${output}`);
}

async function writeProject() {
    const runtime = (name: string) => JSON.stringify(path.join(srcDir, 'runtime', `${name}.ts`));
    const files: Record<string, string> = {
        'package.json': JSON.stringify({
            name: 'traced-e2e',
            private: true,
            type: 'module',
            nzyme: { affected: { suites: { e2e: { patterns: ['e2e/**/*.spec.ts'], traced: true } } } },
        }),
        '.gitignore': 'node_modules\ntest-results\n',
        'app/src/main.ts': [
            "import { greetLabel } from './label.js';",
            "import { never } from './unused.js';",
            'function init(): void {',
            "    document.querySelector('button')?.addEventListener('click', async () => {",
            "        const { text } = (await (await fetch('/api/greet')).json()) as { text: string };",
            '        document.title = greetLabel(text);',
            '    });',
            "    document.querySelector('a')?.addEventListener('click', never);",
            "    void navigator.serviceWorker.register('/sw.js');",
            '}',
            'init();',
            '',
        ].join('\n'),
        'app/src/label.ts': 'export function greetLabel(text: string): string {\n    return text.toUpperCase();\n}\n',
        'app/src/unused.ts': "export function never(): void {\n    throw new Error('never');\n}\n",
        'app/pages/index.html':
            '<!doctype html><button>go</button><a>never</a><img src="/img/logo.svg"><script type="module" src="/main.js"></script>\n',
        // A service worker the page registers: page coverage never covers it.
        'app/dist/sw.js': "self.addEventListener('fetch', () => undefined);\n",
        'app/public/img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
        'server/greet.js': "export function greet() {\n    return 'hello';\n}\n",
        'server/other.js': "export function other() {\n    return 'other';\n}\n",
        'server/server.js': [
            "import path from 'node:path';",
            `import { markReady } from ${runtime('markReady')};`,
            `import { readTraceLabel } from ${runtime('readTraceLabel')};`,
            `import { traceScope } from ${runtime('traceScope')};`,
            "import { greet } from './greet.js';",
            "import { other } from './other.js';",
            "const app = path.join(import.meta.dir, '../app');",
            'const server = Bun.serve({',
            '    port: 0,',
            '    async fetch(request) {',
            '        const { pathname } = new URL(request.url);',
            "        if (pathname === '/api/greet') {",
            '            return traceScope(readTraceLabel(request.headers), () => Response.json({ text: greet() }));',
            '        }',
            "        if (pathname === '/api/other') {",
            '            return traceScope(readTraceLabel(request.headers), () => Response.json({ text: other() }));',
            '        }',
            "        for (const dir of ['dist', 'public']) {",
            '            const file = Bun.file(path.join(app, dir, pathname));',
            "            if (pathname !== '/' && (await file.exists())) {",
            '                return new Response(file);',
            '            }',
            '        }',
            "        return new Response(Bun.file(path.join(app, 'pages/index.html')));",
            '    },',
            '});',
            'markReady();',
            'console.log(`PORT=${server.port}`);',
            '',
        ].join('\n'),
        'e2e/playwright.config.ts': [
            'export default {',
            "    testDir: '.',",
            '    workers: 1,',
            '    timeout: 20_000,',
            '    reporter: [',
            "        ['list'],",
            '        [',
            '            `${process.env.SRC_DIR}/playwright/TraceReporter.ts`,',
            '            { resultsFile: process.env.RESULTS_FILE, traceDir: process.env.TRACE_DIR, ownsServers: true },',
            '        ],',
            '    ],',
            '    use: {',
            "        nzymeTrace: { apps: [{ origin: process.env.APP_ORIGIN, publicDir: 'app/public', outputDir: 'app/dist' }] },",
            '    },',
            '};',
            '',
        ].join('\n'),
        'e2e/app.spec.ts': [
            "import { expect } from '@playwright/test';",
            '',
            `import { traceTest as test } from ${JSON.stringify(path.join(srcDir, 'playwright/traceTest.ts'))};`,
            '',
            'const origin = process.env.APP_ORIGIN;',
            '',
            "test('greets', async ({ page }) => {",
            '    await page.goto(`${origin}/`);',
            "    await page.click('button');",
            "    await expect(page).toHaveTitle(process.env.FAIL ? 'nope' : 'HELLO', { timeout: 2000 });",
            '    // A second document: the first one keeps the coverage of what ran in it.',
            '    await page.goto(`${origin}/again`);',
            '});',
            '',
            "test('labels a context the test creates', async ({ browser }) => {",
            '    const context = await browser.newContext();',
            '    const page = await context.newPage();',
            '    await page.goto(`${origin}/`);',
            "    await page.evaluate(() => fetch('/api/other'));",
            '    await context.close();',
            '});',
            '',
        ].join('\n'),
    };
    for (const [name, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, name)), { recursive: true });
        await writeFile(path.join(root, name), content);
    }
}
