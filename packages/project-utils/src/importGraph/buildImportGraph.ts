import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Package } from '../getPackages.js';
import { extractEsmSpecifiers, extractImplicitSpecifiers } from './extractImportSpecifiers.js';
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
    /** Prunes more than `.gitignore` does — see {@link walkProjectFiles}. */
    ignore?: (relativePath: string) => boolean;
    /**
     * Root-relative paths that imports may resolve to although the walk does not list them — a
     * deleted file, or a gitignored generated one (`*.loc.ts`). They are targets only, never parsed.
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
    /** Every walked file, sorted — source or not. */
    files: string[];
    /** Direct importers of a root-relative path; `[]` for a path nothing imports. */
    importersOf(path: string): ImportEdge[];
}

/**
 * Builds the reverse import graph of a project in one scan: walks every non-ignored file, parses
 * the sources (`.ts .tsx .mts .js .mjs .vue .scss`, `.d.ts` included — their imports are real
 * edges too) and resolves each specifier against the walked paths (any extension, so JSON, SVG
 * and directory URLs resolve) plus `extraPaths`.
 */
export async function buildImportGraph(options: BuildImportGraphOptions): Promise<ImportGraph> {
    const { root } = options;
    const files = await walkProjectFiles(root, options.ignore);
    const paths = new Set(files);
    for (const extra of options.extraPaths ?? []) {
        paths.add(extra);
    }

    const resolver = createImportResolver({ root, packages: options.packages, aliases: options.aliases, paths });
    const importers = new Map<string, ImportEdge[]>();

    const parsed = await Promise.all(
        files.map(async file => {
            const sourceKind = getSourceKind(file);
            if (!sourceKind) {
                return [];
            }
            const content = await readFile(path.join(root, file), 'utf8');
            return resolveEdges(file, extractSpecifiers(content, sourceKind));
        }),
    );

    for (const edges of parsed) {
        for (const edge of edges) {
            const list = importers.get(edge.to);
            if (list) {
                list.push(edge);
            } else {
                importers.set(edge.to, [edge]);
            }
        }
    }

    return {
        files,
        importersOf: target => importers.get(target) ?? [],
    };

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

function getSourceKind(file: string): ImportSourceKind | null {
    switch (path.posix.extname(file)) {
        case '.ts':
        case '.tsx':
        case '.mts':
        case '.js':
        case '.mjs':
            return 'script';
        case '.vue':
            return 'vue';
        case '.scss':
            return 'scss';
        default:
            return null;
    }
}
