import { afterAll, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { rollup } from 'rollup';

import { resolveExternalsPlugin } from './resolveExternalsPlugin.js';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-externals-')));

afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

test('resolves conditions-only exports as the "." entry', async () => {
    writePackage('conditions-pkg', {
        main: 'cjs/index.js',
        exports: {
            bun: { import: './esm/worker.js', require: './cjs/worker.js' },
            default: {
                import: { types: './esm/index.d.ts', default: './esm/index.js' },
                require: './cjs/index.js',
            },
        },
    });

    expect(await resolveImport('conditions-pkg')).toBe(packagePath('conditions-pkg', 'esm/index.js'));
});

test('resolves subpath exports', async () => {
    writePackage('subpath-pkg', {
        main: 'cjs/index.js',
        exports: {
            '.': { import: './esm/index.js', require: './cjs/index.js' },
            './feature': { import: './esm/feature.js', require: './cjs/feature.js' },
        },
    });

    expect(await resolveImport('subpath-pkg')).toBe(packagePath('subpath-pkg', 'esm/index.js'));
    expect(await resolveImport('subpath-pkg/feature')).toBe(packagePath('subpath-pkg', 'esm/feature.js'));
});

test('resolves string exports', async () => {
    writePackage('string-pkg', { main: 'cjs/index.js', exports: './esm/index.js' });

    expect(await resolveImport('string-pkg')).toBe(packagePath('string-pkg', 'esm/index.js'));
});

function writePackage(name: string, json: Record<string, unknown>) {
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...json }));
}

function packagePath(name: string, file: string) {
    return path.join(root, 'node_modules', name, file);
}

async function resolveImport(source: string) {
    const input = path.join(root, 'index.js');
    fs.writeFileSync(input, `export * from '${source}';`);

    const bundle = await rollup({ input, plugins: [resolveExternalsPlugin()] });
    const { output } = await bundle.generate({ format: 'esm' });
    await bundle.close();

    return output[0].imports[0];
}
