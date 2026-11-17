import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { createSourceLocator } from './createSourceLocator.js';

let root: string;

beforeAll(async () => {
    // Real path: the bundler writes sources relative to the resolved `/private/var` on macOS.
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'trace-locator-')));
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('a bundle maps each function to its own source, and drops node_modules sources', async () => {
    await writeFiles({
        'src/main.ts':
            "import { fromLib } from './lib.js';\nimport { fromDep } from 'dep';\nexport function fromMain(): string { return fromLib() + fromDep(); }\n",
        'src/lib.ts': "export function fromLib(): string { return 'lib'; }\n",
        'node_modules/dep/package.json': '{ "name": "dep", "main": "index.js" }',
        'node_modules/dep/index.js': "export function fromDep() { return 'dep'; }\n",
    });
    const build = await Bun.build({
        entrypoints: [path.join(root, 'src/main.ts')],
        outdir: path.join(root, 'dist'),
        sourcemap: 'linked',
        minify: false,
    });
    expect(build.success).toBe(true);

    const file = path.join(root, 'dist/main.js');
    const code = await readFile(file, 'utf8');
    const { sourceAt, sources } = createSourceLocator({ file, code, root });

    expect(sourceAt(code.indexOf('function fromMain'))).toBe('src/main.ts');
    expect(sourceAt(code.indexOf('function fromLib'))).toBe('src/lib.ts');
    expect(sourceAt(code.indexOf('function fromDep'))).toBeUndefined();
    expect(sources.toSorted()).toEqual(['src/lib.ts', 'src/main.ts']);
});

test('a file without a source map is its own source, unless it lives in node_modules', () => {
    const code = 'export const f = () => 1;\n';

    expect(createSourceLocator({ file: path.join(root, 'scripts/plain.js'), code, root }).sourceAt(0)).toBe(
        'scripts/plain.js',
    );
    expect(
        createSourceLocator({ file: path.join(root, 'node_modules/x/plain.js'), code, root }).sourceAt(0),
    ).toBeUndefined();
});

test('a bundle of built JavaScript maps through it to the source, and a build older than its input is stale', async () => {
    await writeFiles({
        'pkg/src/lib.ts': "export function fromLib(): string { return 'lib'; }\n",
        'app/main.js':
            "import { fromLib } from '../pkg/dist/lib.js';\nexport function fromMain() { return fromLib(); }\n",
    });
    // A package built on its own (tsc-like: one source per file), then bundled into the app.
    await buildFile('pkg/src/lib.ts', 'pkg/dist');
    await buildFile('app/main.js', 'bundle');

    const file = path.join(root, 'bundle/main.js');
    const code = await readFile(file, 'utf8');
    const { sourceAt, sources, findStale } = createSourceLocator({ file, code, root });

    expect(sourceAt(code.indexOf('function fromLib'))).toBe('pkg/src/lib.ts');
    expect(sources.toSorted()).toEqual(['app/main.js', 'pkg/src/lib.ts']);

    await setModified({ 'pkg/src/lib.ts': 10, 'pkg/dist/lib.js': 20, 'bundle/main.js': 30, 'app/main.js': 5 });
    expect(findStale(sources)).toEqual([]);
    // The package was rebuilt after the bundle: the bundle runs its old build.
    await setModified({ 'pkg/dist/lib.js': 40 });
    expect(findStale(sources)).toEqual(['pkg/src/lib.ts']);
    // The source changed after the package build the bundle took.
    await setModified({ 'pkg/dist/lib.js': 20, 'pkg/src/lib.ts': 25 });
    expect(findStale(sources)).toEqual(['pkg/src/lib.ts']);
});

test('a virtual module of a bundler is not a source', () => {
    const map = { version: 3, sources: ['virtual:nuxt:paths.mjs', '\0commonjsHelpers.js', 'real.ts'], mappings: '' };
    const code = `export {};\n//# sourceMappingURL=data:application/json,${encodeURIComponent(JSON.stringify(map))}\n`;

    const { sources } = createSourceLocator({ file: path.join(root, 'out/virtual.js'), code, root });

    expect(sources).toEqual(['out/real.ts']);
});

async function buildFile(entry: string, outdir: string) {
    const build = await Bun.build({
        entrypoints: [path.join(root, entry)],
        outdir: path.join(root, outdir),
        sourcemap: 'linked',
        minify: false,
    });
    expect(build.success).toBe(true);
}

/** Sets modification times, in seconds since the epoch. */
async function setModified(files: Record<string, number>) {
    for (const [name, seconds] of Object.entries(files)) {
        await utimes(path.join(root, name), seconds, seconds);
    }
}

async function writeFiles(files: Record<string, string>) {
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(root, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
    }
}
