import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TraceMap } from '@jridgewell/trace-mapping';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { createBuildChecker } from './createBuildChecker.js';

let root: string;

beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'trace-build-checker-')));
    await mkdir(path.join(root, 'pkg/src'), { recursive: true });
    await writeFile(path.join(root, 'pkg/src/lib.ts'), 'export const lib = 1;\n');
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('a build is current by the content its map embeds, and stale when it embeds other content', async () => {
    const input = path.join(root, 'pkg/src/lib.ts');
    // A checker per build: it caches its answer per built file.
    const current = await createBuildChecker(root);
    const changed = await createBuildChecker(root);

    expect(current.isCurrent({ builtFile: built(), map: mapOf('export const lib = 1;\n'), input })).toBe(true);
    expect(changed.isCurrent({ builtFile: built(), map: mapOf('export const lib = 0;\n'), input })).toBe(false);
});

test('without embedded content or a build info covering the input, a build is not shown current', async () => {
    const input = path.join(root, 'pkg/src/lib.ts');

    expect((await createBuildChecker(root)).isCurrent({ builtFile: built(), map: mapOf(null), input })).toBe(false);
    const checker = await createBuildChecker(root);
    expect(checker.isCurrent({ builtFile: built(), map: undefined, input })).toBe(false);
    // A virtual module, or a deleted file the variant check reports.
    expect(checker.isCurrent({ builtFile: built(), map: undefined, input: path.join(root, 'pkg/src/gone.ts') })).toBe(
        true,
    );
});

test('an asset the bundle embeds as generated code is current while it is not newer than the bundle', async () => {
    const asset = path.join(root, 'pkg/src/logo.svg');
    await writeFile(asset, '<svg/>\n');
    await mkdir(path.dirname(built()), { recursive: true });
    await writeFile(built(), 'export {};\n');
    const map = new TraceMap(
        {
            version: 3,
            sources: ['../src/logo.svg?component'],
            sourcesContent: ['import { createElementVNode } from "vue";'],
            names: [],
            mappings: '',
        },
        built(),
    );

    await utimes(asset, 10, 10);
    await utimes(built(), 20, 20);
    expect((await createBuildChecker(root)).isCurrent({ builtFile: built(), map, input: asset })).toBe(true);

    await utimes(asset, 30, 30);
    expect((await createBuildChecker(root)).isCurrent({ builtFile: built(), map, input: asset })).toBe(false);
});

function built() {
    return path.join(root, 'pkg/dist/lib.js');
}

function mapOf(content: string | null) {
    return new TraceMap(
        { version: 3, sources: ['../src/lib.ts'], sourcesContent: [content], names: [], mappings: '' },
        built(),
    );
}
