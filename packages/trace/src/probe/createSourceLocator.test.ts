import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { createBuildChecker } from './createBuildChecker.js';
import type { BuildChecker } from './createBuildChecker.js';
import { createSourceLocator } from './createSourceLocator.js';

let root: string;
let buildChecker: BuildChecker;

beforeAll(async () => {
    // Real path: the bundler writes sources relative to the resolved `/private/var` on macOS.
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'trace-locator-')));
    buildChecker = await createBuildChecker(root);
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
    const { sourceAt, sources } = createSourceLocator({ file, code, root, buildChecker });

    expect(sourceAt(code.indexOf('function fromMain'))).toBe('src/main.ts');
    expect(sourceAt(code.indexOf('function fromLib'))).toBe('src/lib.ts');
    expect(sourceAt(code.indexOf('function fromDep'))).toBeUndefined();
    expect(sources.toSorted()).toEqual(['src/lib.ts', 'src/main.ts']);
});

test('a file without a source map is its own source, unless it lives in node_modules', () => {
    const code = 'export const f = () => 1;\n';

    expect(
        createSourceLocator({ file: path.join(root, 'scripts/plain.js'), code, root, buildChecker }).sourceAt(0),
    ).toBe('scripts/plain.js');
    expect(
        createSourceLocator({ file: path.join(root, 'node_modules/x/plain.js'), code, root, buildChecker }).sourceAt(0),
    ).toBeUndefined();
});

test('a bundle of a tsc-built package maps through it to the source, stale only when some build does not hold the current content', async () => {
    const lib = "export function fromLib(): string { return 'lib'; }\n";
    const main = "import { fromLib } from '../pkg/dist/lib.js';\nexport function fromMain() { return fromLib(); }\n";
    await writeFiles({ 'pkg/tsconfig.json': TSCONFIG, 'pkg/src/lib.ts': lib, 'app/main.js': main });
    // A workspace package built by tsgo (one source per file, a build info), then bundled into an app.
    await compileWithTsgo('pkg');
    await buildFile('app/main.js', 'bundle');

    const file = path.join(root, 'bundle/main.js');
    const code = await readFile(file, 'utf8');
    // A fresh checker per look: one caches what it read, as a process does.
    const locate = async () => createSourceLocator({ file, code, root, buildChecker: await createBuildChecker(root) });
    const { sourceAt, sources } = await locate();

    expect(sourceAt(code.indexOf('function fromLib'))).toBe('pkg/src/lib.ts');
    expect(sources.toSorted()).toEqual(['app/main.js', 'pkg/src/lib.ts']);
    expect((await locate()).findStale(sources)).toEqual([]);

    // A checkout touches files without changing them.
    await setModified({ 'pkg/src/lib.ts': 4_000_000_000, 'app/main.js': 4_000_000_000 });
    expect((await locate()).findStale(sources)).toEqual([]);

    await writeFiles({ 'pkg/src/lib.ts': lib.replace("'lib'", "'changed'") });
    expect((await locate()).findStale(sources)).toEqual(['pkg/src/lib.ts']);

    await writeFiles({ 'pkg/src/lib.ts': lib, 'app/main.js': `// edited\n${main}` });
    expect((await locate()).findStale(sources)).toEqual(['app/main.js']);
});

test('a virtual module of a bundler is not a source, and a query names the file before it', () => {
    const map = {
        version: 3,
        sources: ['virtual:nuxt:paths.mjs', '\0commonjsHelpers.js', 'real.ts', 'icon.svg?component', 'icon.svg#x'],
        mappings: '',
    };
    const code = `export {};\n//# sourceMappingURL=data:application/json,${encodeURIComponent(JSON.stringify(map))}\n`;

    const { sources } = createSourceLocator({ file: path.join(root, 'out/virtual.js'), code, root, buildChecker });

    expect(sources).toEqual(['out/real.ts', 'out/icon.svg']);
});

/** A package's `tsconfig.json`, as a workspace package builds: source maps and a build info in `dist`. */
const TSCONFIG = JSON.stringify({
    compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        rootDir: 'src',
        outDir: 'dist',
        sourceMap: true,
        incremental: true,
        tsBuildInfoFile: 'dist/.tsbuildinfo',
        types: [],
        skipLibCheck: true,
    },
    include: ['src'],
});

async function compileWithTsgo(dir: string) {
    const tsgo = path.join(import.meta.dir, '../../node_modules/.bin/tsgo');
    const compile = Bun.spawn([tsgo, '-p', path.join(root, dir, 'tsconfig.json')], { stdout: 'pipe', stderr: 'pipe' });
    expect(await compile.exited).toBe(0);
}

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
