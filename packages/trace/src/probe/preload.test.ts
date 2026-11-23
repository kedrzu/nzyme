import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { TraceLine } from '../TraceLine.js';

// A real Bun process started with the preload, as a traced backend runs: plain JS files under a
// project root, Effect fibers, a worker thread. Files without a source map are their own source.
const preloadPath = path.join(import.meta.dir, 'preload.ts');
const runtimeDir = path.join(import.meta.dir, '../runtime');
const effectUrl = import.meta.resolve('effect');

let root: string;

beforeAll(async () => {
    // Real path: Bun reports module paths resolved, and macOS temp dirs sit behind a symlink.
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'trace-preload-')));
    await writeFiles({
        'package.json': '{ "name": "traced-app", "private": true, "type": "module" }',
        'app/main.js': mainScript(),
        'node_modules/dep/index.js': "export function depWork() { return 'dep'; }\n",
        'app/worker.js': "import { workerWork } from './workerWork.js';\nworkerWork();\n",
        ...Object.fromEntries(
            ['startupWork', 'mailboxWork', 'fiberWork', 'promiseWork', 'workerWork'].map(name => [
                `app/${name}.js`,
                `export function ${name}() { return '${name}'; }\n`,
            ]),
        ),
    });
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('labels reach forked fibers, Effect.promise thunks and async continuations; a startup fiber stays unlabelled', async () => {
    const traceDir = path.join(root, 'trace-labels');
    const output = await runApp({ BUN_OPTIONS: `--preload=${preloadPath}`, NZYME_TRACE_DIR: traceDir });

    const byKind = groupObservations(output.observed);
    expect(byKind.fiber).toEqual(['a=a', 'a=a', 'b=b', 'b=b']);
    expect(byKind.promise).toEqual(['a=a', 'a=a', 'b=b', 'b=b']);
    expect(byKind.continuation).toEqual(['a=a', 'a=a', 'b=b', 'b=b']);
    expect(byKind.mailbox).toEqual(['-=null', '-=null', '-=null', '-=null']);
    expect(output.labelOutside).toBeNull();

    const trace = await readTrace(traceDir);
    expect(trace.labelsOf('app/fiberWork.js')).toEqual(['a', 'b']);
    expect(trace.labelsOf('app/promiseWork.js')).toEqual(['a', 'b']);
    expect(trace.labelsOf('app/mailboxWork.js')).toEqual([null]);
    expect(trace.labelsOf('app/startupWork.js')).toEqual([null]);
});

test('the trace file records the process, its startup, a heartbeat and a clean end; a worker writes its own', async () => {
    const traceDir = path.join(root, 'trace-files');
    await runApp({ BUN_OPTIONS: `--preload=${preloadPath}`, NZYME_TRACE_DIR: traceDir });

    const trace = await readTrace(traceDir);
    const [main, worker] = trace.processes;
    expect(trace.processes).toHaveLength(2);
    expect(main?.lines[0]).toMatchObject({ type: 'start', threadId: 0, root, bucketMs: 100 });
    expect(main?.lines.at(-1)?.type).toBe('end');
    expect(main?.lines.filter(line => line.type === 'flush').length).toBeGreaterThan(1);

    const readyAt = main?.lines.find(line => line.type === 'ready')?.at ?? 0;
    expect(trace.firstHitBucket('app/startupWork.js')).toBeLessThanOrEqual(Math.floor(readyAt / 100));
    expect(trace.firstHitBucket('app/fiberWork.js')).toBeGreaterThanOrEqual(Math.floor(readyAt / 100));

    expect(worker?.lines[0]).toMatchObject({ type: 'start', threadId: 1 });
    expect(worker?.files).toContain('app/workerWork.js');
    expect(main?.files).not.toContain('app/workerWork.js');
    expect(main?.files.filter(file => !file.startsWith('app/'))).toEqual([]);
});

test('without NZYME_TRACE_DIR the preload installs nothing, and the runtime API is inert', async () => {
    const envs: Record<string, string>[] = [{ BUN_OPTIONS: `--preload=${preloadPath}` }, {}];
    for (const env of envs) {
        const output = await runApp(env);

        expect(output.runtimeInstalled).toBe(false);
        expect(output.workerPreloadOptions).toEqual({});
        expect(new Set(output.observed.map(([, , actual]) => actual))).toEqual(new Set([null]));
    }
});

test('the runtime API never imports the probe, so production code does not load it', async () => {
    for (const file of await readdir(runtimeDir)) {
        const code = await readFile(path.join(runtimeDir, file), 'utf8');
        expect({ file, importsProbe: code.includes("from '../probe/") }).toEqual({ file, importsProbe: false });
    }
});

/** One observation: `[kind, expected label, label seen]`. */
type Observation = [kind: string, expected: string | null, actual: string | null];

interface AppOutput {
    observed: Observation[];
    labelOutside: string | null;
    runtimeInstalled: boolean;
    workerPreloadOptions: unknown;
}

async function runApp(env: Record<string, string>): Promise<AppOutput> {
    const inherited = { ...process.env };
    delete inherited.NZYME_TRACE_DIR;
    delete inherited.BUN_OPTIONS;

    const child = Bun.spawn([process.execPath, 'app/main.js'], {
        cwd: root,
        env: { ...inherited, ...env },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    if (exitCode !== 0 || stderr.includes('[@nzyme/trace]')) {
        throw new Error(`app failed (exit ${exitCode}):\n${stderr}`);
    }
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as AppOutput;
}

async function readTrace(traceDir: string) {
    const names = (await readdir(traceDir)).toSorted((a, b) => threadOf(a) - threadOf(b));
    const processes = await Promise.all(
        names.map(async name => {
            const text = await readFile(path.join(traceDir, name), 'utf8');
            const lines = text
                .trim()
                .split('\n')
                .map(line => JSON.parse(line) as TraceLine);
            const files = new Map<number, string>();
            const hits: { file: string; bucket: number; label: string | null }[] = [];
            for (const line of lines) {
                if (line.type !== 'flush') {
                    continue;
                }
                for (const [id, file] of line.files) {
                    files.set(id, file);
                }
                for (const [bucket, label, fileIds] of line.hits) {
                    for (const id of fileIds) {
                        hits.push({ file: files.get(id) ?? `unknown file ${id}`, bucket, label });
                    }
                }
            }
            return { lines, hits, files: [...files.values()] };
        }),
    );
    const hits = processes.flatMap(process => process.hits);

    return {
        processes,
        labelsOf: (file: string) =>
            [...new Set(hits.filter(hit => hit.file === file).map(hit => hit.label))].toSorted((a, b) =>
                String(a).localeCompare(String(b)),
            ),
        firstHitBucket: (file: string) => Math.min(...hits.filter(hit => hit.file === file).map(hit => hit.bucket)),
    };
}

function threadOf(name: string) {
    return Number(/-(\d+)\.ndjson$/.exec(name)?.[1]);
}

function groupObservations(observed: Observation[]) {
    const byKind: Record<string, string[]> = {};
    for (const [kind, expected, actual] of observed) {
        (byKind[kind] ??= []).push(`${expected ?? '-'}=${actual ?? 'null'}`);
    }
    for (const list of Object.values(byKind)) {
        list.sort();
    }
    return byKind;
}

async function writeFiles(files: Record<string, string>) {
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(root, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
    }
}

function mainScript() {
    const runtime = (name: string) => JSON.stringify(path.join(runtimeDir, `${name}.ts`));
    return `
import { Worker } from 'node:worker_threads';
import { Effect, Fiber, Queue } from ${JSON.stringify(effectUrl)};
import { traceScope } from ${runtime('traceScope')};
import { currentTraceLabel } from ${runtime('currentTraceLabel')};
import { markReady } from ${runtime('markReady')};
import { workerPreloadOptions } from ${runtime('workerPreloadOptions')};
import { startupWork } from './startupWork.js';
import { mailboxWork } from './mailboxWork.js';
import { fiberWork } from './fiberWork.js';
import { promiseWork } from './promiseWork.js';
import { depWork } from '../node_modules/dep/index.js';

const observed = [];
const label = () => currentTraceLabel() ?? null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

startupWork();
depWork();
const mailbox = Effect.runSync(Queue.unbounded());
const startupFiber = Effect.runFork(Effect.forever(Effect.gen(function* () {
    const done = yield* Queue.take(mailbox);
    yield* Effect.sleep(1);
    mailboxWork();
    observed.push(['mailbox', null, label()]);
    done();
})));
await delay(150);
markReady();

async function request(expected) {
    await Effect.runPromise(Effect.gen(function* () {
        const child = yield* Effect.forkChild(Effect.gen(function* () {
            yield* Effect.sleep(2);
            fiberWork();
            observed.push(['fiber', expected, label()]);
        }));
        yield* Effect.promise(async () => {
            await delay(2);
            promiseWork();
            observed.push(['promise', expected, label()]);
        });
        yield* Fiber.join(child);
    }));
    await delay(1);
    observed.push(['continuation', expected, label()]);
    await new Promise(resolve => Effect.runSync(Queue.offer(mailbox, resolve)));
}

await Promise.all(['a', 'b', 'a', 'b'].map(expected => traceScope(expected, () => request(expected))));

const worker = new Worker(new URL('./worker.js', import.meta.url), workerPreloadOptions());
await new Promise(resolve => worker.on('exit', resolve));
await Effect.runPromise(Fiber.interrupt(startupFiber));
await delay(250);

console.log(JSON.stringify({
    observed,
    labelOutside: label(),
    runtimeInstalled: globalThis.__nzymeTrace !== undefined,
    workerPreloadOptions: workerPreloadOptions(),
}));
`;
}
