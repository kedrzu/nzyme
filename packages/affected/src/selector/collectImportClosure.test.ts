import { expect, test } from 'bun:test';

import type { ImportEdge, ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';

import { collectImportClosure } from './collectImportClosure.js';

// router.ts statically imports shared.ts and lazily loads page.ts, which imports widget.ts.
const GRAPH = createGraph([
    { from: 'router.ts', to: 'shared.ts', dynamic: false },
    { from: 'router.ts', to: 'page.ts', dynamic: true },
    { from: 'page.ts', to: 'widget.ts', dynamic: false },
]);

test('follows static and dynamic imports by default', () => {
    expect(collectImportClosure(GRAPH, ['router.ts'])).toEqual(new Set(['shared.ts', 'page.ts', 'widget.ts']));
});

test('a static-only closure leaves out a dynamically imported module and what only it imports', () => {
    expect(collectImportClosure(GRAPH, ['router.ts'], { staticOnly: true })).toEqual(new Set(['shared.ts']));
});

function createGraph(edges: ImportEdge[]): ImportGraph {
    return {
        files: [...new Set(edges.flatMap(edge => [edge.from, edge.to]))].toSorted(),
        importersOf: file => edges.filter(edge => edge.to === file),
        importsOf: file => edges.filter(edge => edge.from === file),
    };
}
