import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { compileFunction } from './compileFunction.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/compileFunctionPlugins/', import.meta.url));
const ENTRY = path.join(FIXTURES, 'entry.js');
const PLUGIN_MODULE = path.join(FIXTURES, 'greetingPlugin.js');

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
