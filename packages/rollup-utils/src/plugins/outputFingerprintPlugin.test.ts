import { afterAll, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { rollup } from 'rollup';
import type { Plugin, SourceMapInput } from 'rollup';

import { outputFingerprintPlugin } from './outputFingerprintPlugin.js';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'output-fingerprint-')));

afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

test('the first build counts as changed', async () => {
    const fingerprint = outputFingerprintPlugin();

    await build(fingerprint, { code: 'export const a = 1;' });

    expect(fingerprint.api.outputChanged()).toBe(true);
});

test('rebuilding the same code is unchanged', async () => {
    const fingerprint = outputFingerprintPlugin();

    await build(fingerprint, { code: 'export const a = 1;' });
    await build(fingerprint, { code: 'export const a = 1;' });

    expect(fingerprint.api.outputChanged()).toBe(false);
});

test('rebuilding different code is changed', async () => {
    const fingerprint = outputFingerprintPlugin();

    await build(fingerprint, { code: 'export const a = 1;' });
    await build(fingerprint, { code: 'export const a = 2;' });

    expect(fingerprint.api.outputChanged()).toBe(true);
});

test('a source map difference alone is unchanged', async () => {
    const fingerprint = outputFingerprintPlugin();
    const code = 'export const a = 1;';

    await build(fingerprint, { code, map: sourceMap('AAAA') });
    const firstMap = readOutput('main.js.map');
    await build(fingerprint, { code, map: sourceMap('AACA') });

    expect(readOutput('main.js.map')).not.toBe(firstMap);
    expect(fingerprint.api.outputChanged()).toBe(false);
});

test('a build that fails before writing is not the baseline', async () => {
    const fingerprint = outputFingerprintPlugin();

    await build(fingerprint, { code: 'export const a = 1;' });
    await expect(build(fingerprint, { code: 'export const a = 2;' }, failingWritePlugin())).rejects.toThrow();
    await build(fingerprint, { code: 'export const a = 1;' });

    expect(fingerprint.api.outputChanged()).toBe(false);
});

type Source = { code: string; map?: SourceMapInput };

async function build(fingerprint: Plugin, source: Source, ...plugins: Plugin[]) {
    const bundle = await rollup({ input: 'main', plugins: [virtualEntry(source), fingerprint, ...plugins] });
    try {
        await bundle.write({ format: 'esm', dir: root, sourcemap: true });
    } finally {
        await bundle.close();
    }
}

function virtualEntry(source: Source): Plugin {
    return {
        name: 'virtual-entry',
        resolveId: id => (id === 'main' ? id : null),
        load: id => (id === 'main' ? source : null),
    };
}

/** Fails between fingerprinting and writing — rollup emits `ERROR` for the build. */
function failingWritePlugin(): Plugin {
    return {
        name: 'failing-write',
        generateBundle: {
            order: 'post',
            handler() {
                throw new Error('build failed');
            },
        },
    };
}

function sourceMap(mappings: string): SourceMapInput {
    return { version: 3, sources: ['main.src'], names: [], mappings };
}

function readOutput(fileName: string) {
    return fs.readFileSync(path.join(root, fileName), 'utf8');
}
