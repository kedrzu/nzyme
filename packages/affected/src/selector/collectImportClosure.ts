import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';

/** Options of {@link collectImportClosure}. */
export interface CollectImportClosureOptions {
    /**
     * Skip dynamic `import('…')` edges: loading a file does not load what it imports lazily.
     */
    staticOnly?: boolean;
}

/**
 * Everything `files` import, transitively, through the import graph — the starting files excluded
 * unless one of them is reached again.
 * @__NO_SIDE_EFFECTS__
 */
export function collectImportClosure(
    graph: ImportGraph,
    files: Iterable<string>,
    options: CollectImportClosureOptions = {},
): Set<string> {
    const closure = new Set<string>();
    const queue = [...files];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        for (const edge of graph.importsOf(file)) {
            if (options.staticOnly && edge.dynamic) {
                continue;
            }
            if (!closure.has(edge.to)) {
                closure.add(edge.to);
                queue.push(edge.to);
            }
        }
    }
    return closure;
}
