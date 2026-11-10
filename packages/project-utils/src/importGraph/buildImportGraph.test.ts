import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { Package } from '../getPackages.js';
import { clearIgnoreCache } from '../isFileIgnored.js';
import { buildImportGraph } from './buildImportGraph.js';
import type { ImportGraph } from './buildImportGraph.js';

let root: string;
let graph: ImportGraph;

const files: Record<string, string> = {
    '.gitignore': ['dist/', '*.loc.ts'].join('\n'),
    'packages/common/package.json': '{}',
    'packages/common/src/index.ts': `export * from './format.js';`,
    'packages/common/src/format.ts': `export function format() {}`,
    'packages/common/src/types.ts': `export interface Thing {}`,
    'packages/common/src/cycle/a.ts': `import { b } from './b.js';\nexport const a = 1;`,
    'packages/common/src/cycle/b.ts': `import { c } from './c.js';\nexport const b = 1;`,
    'packages/common/src/cycle/c.ts': `import { a } from './a.js';\nexport const c = 1;`,
    'packages/common/src/cycle/a.test.ts': `import { a } from './a.js';`,
    'packages/common/src/mixed.ts': `import type { Thing } from './types.js';\nimport { format } from './format.js';\nimport type { format as f } from './format.js';`,
    'packages/common/src/docs.ts': `/** @example import { format } from './format.js'; */\nexport const docs = 1;`,
    'packages/common/src/Messages.loc.ts': `import { format } from './format.js';`,
    'packages/common/src/Messages.loc.yaml': `hello: Hello`,
    'packages/common/src/useMessages.ts': `import { Messages } from './Messages.loc.js';`,
    'packages/common/dist/index.js': `import './format.js';`,
    'packages/app/package.json': '{}',
    'packages/app/utils/format.ts': `import { format } from '@acme/common/format.js';`,
    'packages/app/components/Page.vue': [
        `<script setup lang="ts">`,
        `import { format } from '@/utils/format.js';`,
        `import Child from './Child.vue';`,
        `</script>`,
        `<template><Child /></template>`,
        `<style lang="scss" module src="./Page.module.scss" />`,
    ].join('\n'),
    'packages/app/components/Child.vue': `<template><p>child</p></template>`,
    'packages/app/components/Page.module.scss': `@use '../styles/colors';`,
    'packages/app/styles/_colors.scss': `$primary: red;`,
    'packages/app/test/fixtures.test.ts': `const dir = new URL('../fixtures/', import.meta.url);\nconst one = new URL('../data/one.json', import.meta.url);`,
    'packages/app/fixtures/a.json': '{}',
    'packages/app/fixtures/b.txt': '',
    'packages/app/data/one.json': '{}',
    'packages/other/package.json': '{}',
    'packages/other/utils/format.ts': `export const format = 1;`,
};

const packages: Package[] = [
    {
        path: 'packages/common',
        packageJson: {
            name: '@acme/common',
            exports: { '.': { source: './src/index.ts' }, './*.js': { source: './src/*.ts' } },
        },
    },
    { path: 'packages/app', packageJson: { name: '@acme/app' } },
    { path: 'packages/other', packageJson: { name: '@acme/other' } },
];

beforeAll(async () => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'build-import-graph-')));
    spawnSync('git', ['init', '-q'], { cwd: root });
    for (const [name, content] of Object.entries(files)) {
        fs.outputFileSync(path.join(root, name), content);
    }
    clearIgnoreCache();

    graph = await buildImportGraph({
        root,
        packages: packages.map(pkg => ({ ...pkg, path: path.join(root, pkg.path) })),
        aliases: [{ prefix: '@/', packages: ['@acme/app'] }],
        extraPaths: ['packages/common/src/Messages.loc.ts'],
    });
});

afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    clearIgnoreCache();
});

function importers(target: string): string[] {
    return graph.importersOf(target).map(edge => edge.from);
}

/** Everything that transitively imports `start` — the traversal `nzyme affected` does. */
function transitiveImporters(start: string): string[] {
    const visited = new Set([start]);
    const queue = [start];
    for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
        for (const edge of graph.importersOf(current)) {
            if (!visited.has(edge.from)) {
                visited.add(edge.from);
                queue.push(edge.from);
            }
        }
    }
    return [...visited].toSorted();
}

describe('buildImportGraph', () => {
    it('lists the walked files without gitignored ones', () => {
        expect(graph.files).toContain('packages/app/fixtures/b.txt');
        expect(graph.files).not.toContain('packages/common/dist/index.js');
        expect(graph.files).not.toContain('packages/common/src/Messages.loc.ts');
    });

    it('links relative, package, alias, vue, scss and url imports', () => {
        expect(importers('packages/common/src/format.ts')).toEqual([
            'packages/app/utils/format.ts',
            'packages/common/src/index.ts',
            'packages/common/src/mixed.ts',
        ]);
        expect(importers('packages/app/utils/format.ts')).toEqual(['packages/app/components/Page.vue']);
        expect(importers('packages/app/components/Child.vue')).toEqual(['packages/app/components/Page.vue']);
        expect(importers('packages/app/components/Page.module.scss')).toEqual(['packages/app/components/Page.vue']);
        expect(importers('packages/app/styles/_colors.scss')).toEqual(['packages/app/components/Page.module.scss']);
        expect(importers('packages/app/fixtures/a.json')).toEqual(['packages/app/test/fixtures.test.ts']);
        expect(importers('packages/app/fixtures/b.txt')).toEqual(['packages/app/test/fixtures.test.ts']);
        expect(importers('packages/app/data/one.json')).toEqual(['packages/app/test/fixtures.test.ts']);
    });

    it('gives no edge to a same-named file elsewhere, nor from comments or gitignored files', () => {
        expect(importers('packages/other/utils/format.ts')).toEqual([]);
        expect(importers('packages/common/src/format.ts')).not.toContain('packages/common/src/docs.ts');
        expect(importers('packages/common/src/format.ts')).not.toContain('packages/common/src/Messages.loc.ts');
        expect(importers('packages/common/src/format.ts')).not.toContain('packages/common/dist/index.js');
    });

    it('resolves imports of extra paths that the walk does not list', () => {
        expect(importers('packages/common/src/Messages.loc.ts')).toEqual(['packages/common/src/useMessages.ts']);
    });

    it('marks an edge type-only only when every import of the target is', () => {
        const edges = graph.importersOf('packages/common/src/types.ts');
        expect(edges).toEqual([
            { from: 'packages/common/src/mixed.ts', to: 'packages/common/src/types.ts', typeOnly: true },
        ]);
        expect(
            graph.importersOf('packages/common/src/format.ts').find(e => e.from.endsWith('mixed.ts'))?.typeOnly,
        ).toBe(false);
    });

    it('represents a cycle, and a visited-set traversal over it terminates', () => {
        expect(importers('packages/common/src/cycle/a.ts')).toEqual([
            'packages/common/src/cycle/a.test.ts',
            'packages/common/src/cycle/c.ts',
        ]);
        expect(transitiveImporters('packages/common/src/cycle/b.ts')).toEqual([
            'packages/common/src/cycle/a.test.ts',
            'packages/common/src/cycle/a.ts',
            'packages/common/src/cycle/b.ts',
            'packages/common/src/cycle/c.ts',
        ]);
    });

    it('returns [] for a path nothing imports', () => {
        expect(graph.importersOf('packages/does/not/exist.ts')).toEqual([]);
    });
});
