import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
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
    const sourceAt = createSourceLocator({ file, code, root });

    expect(sourceAt(code.indexOf('function fromMain'))).toBe('src/main.ts');
    expect(sourceAt(code.indexOf('function fromLib'))).toBe('src/lib.ts');
    expect(sourceAt(code.indexOf('function fromDep'))).toBeUndefined();
});

test('a file without a source map is its own source, unless it lives in node_modules', () => {
    const code = 'export const f = () => 1;\n';

    expect(createSourceLocator({ file: path.join(root, 'scripts/plain.js'), code, root })(0)).toBe('scripts/plain.js');
    expect(createSourceLocator({ file: path.join(root, 'node_modules/x/plain.js'), code, root })(0)).toBeUndefined();
});

async function writeFiles(files: Record<string, string>) {
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(root, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
    }
}
