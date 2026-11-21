import type { ImportEdge, ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';

import type { AffectedRewrite } from './AffectedConfig.js';
import { rewriteChangedPath } from './rewriteChangedPath.js';

/**
 * The import graph with each `rewrites` target importing the walked files that stand for it
 * (`x.loc.ts` → `x.loc.yaml`, `Foo.ts` → `Foo.handler.ts`), so a closure through the target reaches
 * its source — the dependency the base diff expresses by rewriting a changed source. A gitignored
 * target resolves only when the graph was built with it in `extraPaths`.
 * @__NO_SIDE_EFFECTS__
 */
export function linkRewriteSources(graph: ImportGraph, rewrites: AffectedRewrite[]): ImportGraph {
    const sourceEdges = new Map<string, ImportEdge[]>();
    const targetEdges = new Map<string, ImportEdge[]>();
    for (const source of graph.files) {
        for (const target of rewriteChangedPath(source, rewrites)) {
            const edge: ImportEdge = { from: target, to: source, dynamic: false };
            sourceEdges.set(target, [...(sourceEdges.get(target) ?? []), edge]);
            targetEdges.set(source, [...(targetEdges.get(source) ?? []), edge]);
        }
    }

    return {
        files: graph.files,
        importersOf: file => [...graph.importersOf(file), ...(targetEdges.get(file) ?? [])],
        importsOf: file => [...graph.importsOf(file), ...(sourceEdges.get(file) ?? [])],
    };
}
