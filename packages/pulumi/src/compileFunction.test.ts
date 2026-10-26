import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { compileFunction } from './compileFunction.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/compileFunctionPlugins/', import.meta.url));
const ENTRY = path.join(FIXTURES, 'entry.js');
const PLUGIN_MODULE = path.join(FIXTURES, 'greetingPlugin.js');

const execFileAsync = promisify(execFile);

let outputDir: string;

beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-compile-function-'));
});

afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
});

test('builds a plugin in the worker from its module, export and options', async () => {
    const result = await compileFunction({
        inputFile: ENTRY,
        outputDir,
        esm: true,
        plugins: [{ module: PLUGIN_MODULE, export: 'greetingPlugin', options: { greeting: 'hello from plugin' } }],
    });

    const code = await fs.readFile(result.filePath, 'utf8');
    expect(code).toContain('hello from plugin');
});

test("a plugin's build error fails the compilation", async () => {
    const compilation = compileFunction({
        inputFile: ENTRY,
        outputDir,
        esm: true,
        plugins: [{ module: PLUGIN_MODULE, export: 'greetingPlugin', options: { greeting: 'x', fail: true } }],
    });

    await expect(compilation).rejects.toThrow('fixture plugin failed on purpose');
});

test('a module without the named export fails the compilation', async () => {
    const compilation = compileFunction({
        inputFile: ENTRY,
        outputDir,
        esm: true,
        plugins: [{ module: PLUGIN_MODULE, export: 'missing' }],
    });

    await expect(compilation).rejects.toThrow('has no function export "missing"');
});

test('the Babel step parses import attributes in a Node function', async () => {
    const result = await compileFunction({
        inputFile: fileURLToPath(new URL('./__fixtures__/compileFunctionImportAttributes/entry.js', import.meta.url)),
        outputDir,
        esm: true,
        nodeVersion: 22,
    });

    const code = await fs.readFile(result.filePath, 'utf8');
    expect(code).toContain('json imported through import attributes');
});

// A forked child inherits `process.execArgv`, which under `bun -e`/`node -e` is the eval script, so a
// minifier that forks re-runs the whole compile in every child and fork-bombs the machine.
test('minifying spawns no child processes', async () => {
    const stop = new AbortController();
    const descendants = collectDescendantProcesses(stop.signal);

    try {
        await compileFunction({
            inputFile: fileURLToPath(
                new URL('./__fixtures__/compileFunctionImportAttributes/entry.js', import.meta.url),
            ),
            outputDir,
            esm: true,
            minify: true,
        });
    } finally {
        stop.abort();
    }

    expect(await descendants).toEqual([]);
});

/**
 * Polls the process table until `signal` aborts and returns every descendant of this process it saw,
 * except the `ps` it ran itself.
 */
async function collectDescendantProcesses(signal: AbortSignal) {
    const seen = new Set<string>();

    while (!signal.aborted) {
        for (const entry of await listDescendantProcesses()) {
            seen.add(entry);
        }
    }

    return [...seen];
}

async function listDescendantProcesses() {
    const ps = execFileAsync('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'command=']);
    const { stdout } = await ps;

    const children = new Map<number, { pid: number; command: string }[]>();
    for (const line of stdout.split('\n')) {
        const match = /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?<command>.*)$/.exec(line);
        if (!match?.groups) {
            continue;
        }
        const { pid = '', ppid = '', command = '' } = match.groups;
        const siblings = children.get(Number(ppid)) ?? [];
        siblings.push({ pid: Number(pid), command });
        children.set(Number(ppid), siblings);
    }

    const found: string[] = [];
    const queue = [process.pid];
    for (let parent = queue.shift(); parent != null; parent = queue.shift()) {
        for (const child of children.get(parent) ?? []) {
            if (child.pid === ps.child.pid) {
                continue;
            }
            found.push(`${child.pid} ${child.command}`);
            queue.push(child.pid);
        }
    }

    return found;
}
