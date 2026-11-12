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
     * Root-relative paths that imports may resolve to although walking does not list them — a
     * deleted file, or a gitignored generated file (`x.loc.ts`) a change stands for. They are
     * targets only, never parsed, and not in {@link ImportGraph.files}.
     */
    extraPaths?: Iterable<string>;
}

/** `from` imports `to`; both root-relative. */
export interface ImportEdge {
    from: string;
    to: string;
}

/** The project's file-level import graph. Cycles are kept as they are: a traversal needs a visited set. */
export interface ImportGraph {
    /** Every walked (non-ignored) file, source or not, sorted. */
    files: string[];
    /** Direct importers of a root-relative path, one edge per importing file; `[]` for a path nothing imports. */
    importersOf(path: string): ImportEdge[];
}

/**
 * Builds the reverse import graph of a project in one scan: walks every non-ignored file, parses
 * the sources (`.ts .tsx .mts .js .mjs .vue .scss`, `.d.ts` included — their imports are real
 * edges too) and resolves each specifier against the walked paths (any extension, so JSON and SVG
 * files resolve) plus `extraPaths`. A gitignored file is a target only when it is
 * in `extraPaths`; it is never parsed.
 */
export async function buildImportGraph(options: BuildImportGraphOptions): Promise<ImportGraph> {
    const { root } = options;
    const files = await walkProjectFiles(root);
    const paths = new Set(files);
    for (const extra of options.extraPaths ?? []) {
        paths.add(extra);
    }

    const resolver = createImportResolver({ root, packages: options.packages, aliases: options.aliases, paths });
    const importers = new Map<string, ImportEdge[]>();

    const parsed = await Promise.all(files.map(file => parseFile(file)));
    for (const edges of parsed) {
        for (const edge of edges) {
            addImporter(edge);
        }
    }

    return {
        files,
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
        const targets = new Set<string>();
        for (const specifier of specifiers) {
            for (const target of resolver.resolve(file, specifier)) {
                targets.add(target);
            }
        }
        return [...targets].map(to => ({ from: file, to }));
    }
}

function extractSpecifiers(content: string, sourceKind: ImportSourceKind): ImportSpecifier[] {
    const implicit = extractImplicitSpecifiers(content, sourceKind);
    return sourceKind === 'script' ? [...extractEsmSpecifiers(content), ...implicit] : implicit;
}
