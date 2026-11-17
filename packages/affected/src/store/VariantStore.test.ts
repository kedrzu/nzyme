import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';

import { VariantStore } from './VariantStore.js';
import type { TestUnit, Variant } from './VariantStore.js';

setDefaultTimeout(60_000);

const UNIT: TestUnit = { file: 'e2e/journey.spec.ts', title: ['logs in'] };

const tmpDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

test('concurrent writers in separate processes never leave a partial variant, and eviction keeps the limit', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-variant-store-'));
    tmpDirs.push(dir);

    // Each process stands for a worktree recording the same test.
    const script = `
        import { VariantStore } from ${JSON.stringify(path.join(import.meta.dir, 'VariantStore.ts'))};
        const store = new VariantStore(process.env.STORE_DIR);
        for (let i = 0; i < 30; i++) {
            await store.write({
                unit: ${JSON.stringify(UNIT)},
                files: { ['src/' + process.env.WRITER + '-' + i + '.ts']: { body: 'b'.repeat(100_000), top: 't' } },
                suite: { hash: 's', config: 'c', inputs: {} },
                recordedAt: new Date().toISOString(),
            });
        }
    `;
    const writers = ['a', 'b', 'c', 'd'].map(name =>
        Bun.spawn(['bun', '-e', script], {
            env: { ...process.env, STORE_DIR: dir, WRITER: name },
            stdout: 'ignore',
            stderr: 'pipe',
        }),
    );

    // Meanwhile, every variant file a reader can open is whole.
    const unparsed: string[] = [];
    const writing = { done: false };
    const reader = (async () => {
        while (!writing.done) {
            for (const file of await listJsonFiles(dir)) {
                const content = await fs.readFile(file, 'utf8').catch(() => null);
                if (content !== null && !isJson(content)) {
                    unparsed.push(file);
                }
            }
        }
    })();

    const exitCodes = await Promise.all(writers.map(writer => writer.exited));
    writing.done = true;
    await reader;

    expect(exitCodes).toEqual([0, 0, 0, 0]);
    expect(unparsed).toEqual([]);

    const files = await listAllFiles(dir);
    expect(files.filter(file => !file.endsWith('.json'))).toEqual([]);
    expect(files).toHaveLength(20);
    expect(await new VariantStore(dir).read(UNIT)).toHaveLength(files.length);
});

test('read returns the written variants, newest first, and remove deletes one', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-variant-store-'));
    tmpDirs.push(dir);
    const store = new VariantStore(dir);

    const older = await store.write(createVariant('a', '2026-01-01T00:00:00.000Z'));
    const newer = await store.write(createVariant('b', '2026-02-01T00:00:00.000Z'));
    expect(await store.read(UNIT)).toEqual([newer, older]);
    expect(await store.read({ file: UNIT.file })).toEqual([]);

    // What a writer that died mid-write leaves behind is not a variant.
    const unitDir = path.dirname((await listJsonFiles(dir))[0] ?? '');
    await fs.writeFile(path.join(unitDir, `${newer.id}.json.123.tmp`), '{"version":1,"unit":');
    expect(await store.read(UNIT)).toEqual([newer, older]);

    await store.remove(UNIT, newer.id);
    expect(await store.read(UNIT)).toEqual([older]);
});

function createVariant(top: string, recordedAt: string): Variant {
    return { unit: UNIT, files: { 'src/a.ts': { top } }, suite: { hash: 's', config: 'c', inputs: {} }, recordedAt };
}

async function listAllFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    return entries.filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath, entry.name));
}

async function listJsonFiles(dir: string): Promise<string[]> {
    return (await listAllFiles(dir).catch(() => [])).filter(file => file.endsWith('.json'));
}

function isJson(content: string): boolean {
    try {
        JSON.parse(content);
        return true;
    } catch {
        return false;
    }
}
