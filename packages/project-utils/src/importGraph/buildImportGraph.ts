import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Package } from '../getPackages.js';
import { extractEsmSpecifiers, extractImplicitSpecifiers, getImportSourceKind } from './extractImportSpecifiers.js';
import type { ImportSourceKind, ImportSpecifier } from './extractImportSpecifiers.js';
import { createImportResolver } from './resolveImportTarget.js';
import type { ImportAlias } from './resolveImportTarget.js';
import { walkProjectFiles } from './walkProjectFiles.js';

/** Options of {@link buildImportGraph}. */
export interface BuildImportGraphOptions {
    /** Absolute project root; every node is a path relative to it. */
    root: string;
    /** Workspace packages (from `getPackages`) — bare specifiers resolve through their `exports`. */
    packages: Package[];
    aliases?: ImportAlias[];
    /**
     * Root-relative paths that imports may resolve to although they are not on disk — a deleted
     * file. They are targets only, never parsed.
     */
    extraPaths?: Iterable<string>;
}

/** `from` imports `to`; both root-relative. */
export interface ImportEdge {
    from: string;
    to: string;
    /** Every import of `to` in `from` is `import type` / `export type`. */
    typeOnly: boolean;
}

/** The project's file-level import graph. Cycles are kept as they are: a traversal needs a visited set. */
export interface ImportGraph {
    /**
     * Every walked file, source or not, plus every gitignored source file reached through imports
     * (`*.loc.ts`), sorted.
     */
    files: string[];
    /** Direct importers of a root-relative path; `[]` for a path nothing imports. */
    importersOf(path: string): ImportEdge[];
}

/**
 * Builds the reverse import graph of a project in one scan: walks every non-ignored file, parses
 * the sources (`.ts .tsx .mts .js .mjs .vue .scss`, `.d.ts` included — their imports are real
 * edges too) and resolves each specifier against the walked paths (any extension, so JSON, SVG
 * and directory URLs resolve) plus `extraPaths`.
 *
 * Gitignored source files are reached rather than walked: an import that resolves to one on disk
 * (a generated `x.loc.ts`; never build output or `node_modules` — see `createImportResolver`) makes
 * it a node, and its own imports are followed in turn. A gitignored file nothing imports is not a
 * node.
 */
export async function buildImportGraph(options: BuildImportGraphOptions): Promise<ImportGraph> {
    const { root } = options;
    const walked = await walkProjectFiles(root);
    const paths = new Set(walked);
    for (const extra of options.extraPaths ?? []) {
        paths.add(extra);
    }

    const resolver = createImportResolver({ root, packages: options.packages, aliases: options.aliases, paths });
    const importers = new Map<string, ImportEdge[]>();
    const nodes = new Set(walked);

    let batch = walked;
    while (batch.length > 0) {
        const parsed = await Promise.all(batch.map(file => parseFile(file)));
        const reached = new Set<string>();
        for (const edges of parsed) {
            for (const edge of edges) {
                addImporter(edge);
                if (!nodes.has(edge.to) && !paths.has(edge.to)) {
                    reached.add(edge.to);
                }
            }
        }
        for (const file of reached) {
            nodes.add(file);
        }
        batch = [...reached].toSorted();
    }

    return {
        files: [...nodes].toSorted(),
        importersOf: target => importers.get(target) ?? [],
    };

    async function parseFile(file: string): Promise<ImportEdge[]> {
        const sourceKind = getImportSourceKind(file);
        if (!sourceKind) {
            return [];
        }
        const content = await readFile(path.join(root, file), 'utf8');
        return resolveEdges(file, extractSpecifiers(content, sourceKind));
    }

    function addImporter(edge: ImportEdge): void {
        const list = importers.get(edge.to);
        if (list) {
            list.push(edge);
        } else {
            importers.set(edge.to, [edge]);
        }
    }

    function resolveEdges(file: string, specifiers: ImportSpecifier[]): ImportEdge[] {
        // One edge per target; it is type-only only when every import of the target is.
        const typeOnlyByTarget = new Map<string, boolean>();
        for (const specifier of specifiers) {
            for (const target of resolver.resolve(file, specifier)) {
                typeOnlyByTarget.set(target, (typeOnlyByTarget.get(target) ?? true) && specifier.typeOnly);
            }
        }
        return [...typeOnlyByTarget].map(([to, typeOnly]) => ({ from: file, to, typeOnly }));
    }
}

function extractSpecifiers(content: string, sourceKind: ImportSourceKind): ImportSpecifier[] {
    const implicit = extractImplicitSpecifiers(content, sourceKind);
    return sourceKind === 'script' ? [...extractEsmSpecifiers(content), ...implicit] : implicit;
}
