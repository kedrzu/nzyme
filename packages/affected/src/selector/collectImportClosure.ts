import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';

/**
 * Everything `files` import, transitively, through the import graph — the starting files excluded
 * unless one of them is reached again.
 * @__NO_SIDE_EFFECTS__
 */
export function collectImportClosure(graph: ImportGraph, files: Iterable<string>): Set<string> {
    const closure = new Set<string>();
    const queue = [...files];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        for (const edge of graph.importsOf(file)) {
            if (!closure.has(edge.to)) {
                closure.add(edge.to);
                queue.push(edge.to);
            }
        }
    }
    return closure;
}
