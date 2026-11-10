import { expect, test } from 'bun:test';

import type { ImportEdge, ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';

import type { AffectedConfig } from './AffectedConfig.js';
import type { ChangedFile } from './collectChangedFiles.js';
import type { AffectedSelection, SelectAffectedFilesOptions } from './selectAffectedFiles.js';
import { selectAffectedFiles } from './selectAffectedFiles.js';

/**
 * Two packages and a root script:
 *   a/src/x.test.ts → a/src/x.ts → a/src/hub.ts ← b/src/y.ts ← b/src/y.test.ts
 *   a/src/other.test.ts → a/src/other.ts
 *   b/src/fixture.test.ts reads b/fixtures/data.json through fs (no edge)
 *   scripts/run.test.ts at the root, outside every package
 */
const FILES = [
    'a/package.json',
    'a/src/hub.ts',
    'a/src/other.test.ts',
    'a/src/other.ts',
    'a/src/x.test.ts',
    'a/src/x.ts',
    'b/fixtures/data.json',
    'b/package.json',
    'b/src/fixture.test.ts',
    'b/src/y.test.ts',
    'b/src/y.ts',
    'scripts/run.test.ts',
];
const EDGES: [string, string][] = [
    ['a/src/x.test.ts', 'a/src/x.ts'],
    ['a/src/x.ts', 'a/src/hub.ts'],
    ['b/src/y.ts', 'a/src/hub.ts'],
    ['b/src/y.test.ts', 'b/src/y.ts'],
    ['a/src/other.test.ts', 'a/src/other.ts'],
];

test('selects the changed file and its transitive importers, not unrelated tests', () => {
    expect(select({ changed: ['a/src/hub.ts'] })).toEqual({ files: ['a/src/x.test.ts', 'b/src/y.test.ts'] });
    expect(select({ changed: ['a/src/x.ts'] }).files).toEqual(['a/src/x.test.ts']);
});

test('selects a changed test file itself', () => {
    expect(select({ changed: ['a/src/other.test.ts'] }).files).toEqual(['a/src/other.test.ts']);
});

test('terminates on an import cycle and selects every file on it', () => {
    const edges: [string, string][] = [
        ['c/one.test.ts', 'c/two.ts'],
        ['c/two.ts', 'c/three.ts'],
        ['c/three.ts', 'c/two.ts'],
        ['c/three.test.ts', 'c/three.ts'],
    ];
    const files = ['c/one.test.ts', 'c/three.test.ts', 'c/three.ts', 'c/two.ts'];

    expect(select({ changed: ['c/three.ts'], graph: createGraph(files, edges) }).files).toEqual([
        'c/one.test.ts',
        'c/three.test.ts',
    ]);
});

test('a deleted file seeds its importers but is never selected', () => {
    const edges: [string, string][] = [['a/src/gone.test.ts', 'a/src/gone.ts'], ...EDGES];
    // `a/src/gone.ts` is deleted (not a graph file); a deleted test is not selected either.
    const graph = createGraph([...FILES, 'a/src/gone.test.ts'], edges);

    const selection = select({
        changed: ['a/src/gone.ts', 'b/src/removed.test.ts'],
        deleted: ['a/src/gone.ts', 'b/src/removed.test.ts'],
        graph,
    });

    expect(selection.files).toEqual(['a/src/gone.test.ts']);
});

test('a full-run trigger selects every matching file and names the file and trigger, winning over ignore', () => {
    const config = { fullRunTriggers: ['bun.lock', '**/tsconfig*.json'], ignore: ['**/*.json'] };

    expect(select({ changed: ['b/tsconfig.esm.json'], config })).toEqual({
        files: [
            'a/src/other.test.ts',
            'a/src/x.test.ts',
            'b/src/fixture.test.ts',
            'b/src/y.test.ts',
            'scripts/run.test.ts',
        ],
        fullRun: { file: 'b/tsconfig.esm.json', trigger: '**/tsconfig*.json' },
    });
});

test('triggers match the root-relative path: `package.json` is the root manifest, not a package one', () => {
    const config = { fullRunTriggers: ['package.json'] };

    expect(select({ changed: ['package.json'], config }).fullRun).toEqual({
        file: 'package.json',
        trigger: 'package.json',
    });

    const packageChange = select({ changed: ['b/package.json'], config });
    expect(packageChange.fullRun).toBeUndefined();
    // A package's manifest seeds every source file of that package, and so their importers.
    expect(packageChange.files).toEqual(['b/src/fixture.test.ts', 'b/src/y.test.ts']);
});

test('a package manifest change reaches importers in other packages', () => {
    expect(select({ changed: ['a/package.json'] }).files).toEqual([
        'a/src/other.test.ts',
        'a/src/x.test.ts',
        'b/src/y.test.ts',
    ]);
});

test('a non-source file nothing imports selects every matching file of its owning package', () => {
    expect(select({ changed: ['b/fixtures/data.json'] }).files).toEqual(['b/src/fixture.test.ts', 'b/src/y.test.ts']);
});

test('a non-source file outside every package falls back to the files outside every package', () => {
    expect(select({ changed: ['scripts/data.txt'] }).files).toEqual(['scripts/run.test.ts']);
});

test('a non-source file with an importer follows the graph, not the package fallback', () => {
    const graph = createGraph(FILES, [...EDGES, ['b/src/y.ts', 'b/fixtures/data.json']]);

    expect(select({ changed: ['b/fixtures/data.json'], graph }).files).toEqual(['b/src/y.test.ts']);
});

test('the owning package is the deepest one', () => {
    const graph = createGraph(['a/inner/data.txt', 'a/inner/in.test.ts', 'a/out.test.ts'], []);

    expect(select({ changed: ['a/inner/data.txt'], graph, packageDirs: ['a', 'a/inner'] }).files).toEqual([
        'a/inner/in.test.ts',
    ]);
});

test('an ignored file and a declaration file select nothing', () => {
    const config = { ignore: ['**/*.md', 'docs/**'] };

    expect(select({ changed: ['a/README.md', 'docs/guide.txt', 'a/src/hub.d.ts'], config }).files).toEqual([]);
});

test('a rewrite seeds the rewritten path, and spares its source the package fallback', () => {
    const graph = createGraph([...FILES, 'a/src/x.loc.yaml'], [...EDGES, ['a/src/x.ts', 'a/src/x.loc.ts']]);
    const config = { rewrites: [{ from: '.loc.yaml', to: '.loc.ts' }] };

    // `x.loc.ts` is generated and gitignored: not a graph file, but still a seed.
    expect(select({ changed: ['a/src/x.loc.yaml'], graph, config }).files).toEqual(['a/src/x.test.ts']);
    // Without the rule the yaml file has no importer, so its whole package runs.
    expect(select({ changed: ['a/src/x.loc.yaml'], graph }).files).toEqual(['a/src/other.test.ts', 'a/src/x.test.ts']);
});

test('a handler rewrite reaches the importers of the definition', () => {
    const graph = createGraph(
        ['a/E.handler.ts', 'a/E.ts', 'b/client.test.ts'],
        [
            ['a/E.handler.ts', 'a/E.ts'],
            ['b/client.test.ts', 'a/E.ts'],
        ],
    );

    expect(
        select({ changed: ['a/E.handler.ts'], graph, config: { rewrites: [{ from: '.handler.ts', to: '.ts' }] } })
            .files,
    ).toEqual(['b/client.test.ts']);
});

test('a pattern without `/` matches the basename, one with `/` the root-relative path, braces included', () => {
    const files = [
        'packages/app/src/A.stories.tsx',
        'packages/other/src/B.stories.tsx',
        'packages/ui/src/C.stories.tsx',
        'packages/ui/src/c.ts',
        'packages/uix/src/D.stories.tsx',
    ];
    const graph = createGraph(files, []);
    const changed = files;
    const packageDirs: string[] = [];

    expect(select({ changed, graph, packageDirs, patterns: ['*.stories.tsx'] }).files).toEqual(
        files.filter(file => file.endsWith('.stories.tsx')),
    );
    expect(select({ changed, graph, packageDirs, patterns: ['packages/{ui,app}/**/*.stories.tsx'] }).files).toEqual([
        'packages/app/src/A.stories.tsx',
        'packages/ui/src/C.stories.tsx',
    ]);
    // A pattern with `/` is anchored at the root: `src/*.ts` does not match `packages/ui/src/c.ts`.
    expect(select({ changed, graph, packageDirs, patterns: ['src/*.ts'] }).files).toEqual([]);
});

test('the result is sorted and unique whatever the input order', () => {
    const forward = select({ changed: ['a/src/hub.ts', 'a/src/x.ts', 'b/src/y.ts'] });
    const backward = select({ changed: ['b/src/y.ts', 'a/src/x.ts', 'a/src/hub.ts'] });

    expect(forward.files).toEqual(['a/src/x.test.ts', 'b/src/y.test.ts']);
    expect(backward).toEqual(forward);
});

interface SelectParams {
    changed: string[];
    deleted?: string[];
    graph?: ImportGraph;
    config?: Partial<AffectedConfig>;
    patterns?: string[];
    packageDirs?: string[];
}

function select(params: SelectParams): AffectedSelection {
    const changedFiles: ChangedFile[] = params.changed.map(file => ({
        path: file,
        deleted: params.deleted?.includes(file) ?? false,
    }));
    const options: SelectAffectedFilesOptions = {
        graph: params.graph ?? createGraph(FILES, EDGES),
        changedFiles,
        config: { rewrites: [], fullRunTriggers: [], ignore: [], ...params.config },
        patterns: params.patterns ?? ['*.test.ts'],
        packageDirs: params.packageDirs ?? ['a', 'b'],
    };
    return selectAffectedFiles(options);
}

function createGraph(files: string[], edges: [string, string][]): ImportGraph {
    const importers = new Map<string, ImportEdge[]>();
    for (const [from, to] of edges) {
        importers.set(to, [...(importers.get(to) ?? []), { from, to, typeOnly: false }]);
    }
    return { files: files.toSorted(), importersOf: file => importers.get(file) ?? [] };
}
