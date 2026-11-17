import { createFileCache } from './createFileCache.js';
import type { OxlintNode, OxlintRuleContext, OxlintScope, OxlintVariable } from './oxlintTypes.js';
import type { ExportAnnotationScan } from './scanExportAnnotation.js';
import { NO_SIDE_EFFECTS_ANNOTATION, scanExportAnnotation } from './scanExportAnnotation.js';

/** Maps an import specifier written in `fromFile` to the source file it names, if it can. */
export type SpecifierResolver = (fromFile: string, specifier: string) => string | undefined;

/** Real re-export chains are one or two modules deep; the cap only stops a cycle from hanging. */
const MAX_REEXPORT_HOPS = 5;

/** Wrappers that stand between a leading JSDoc block and the declaration it documents. */
const EXPORT_DECLARATIONS: ReadonlySet<string> = new Set(['ExportDefaultDeclaration', 'ExportNamedDeclaration']);

/** One module a call has crossed into: its text, and each export scanned from it so far. */
interface ModuleEntry {
    source: string;
    scans: Map<string, ExportAnnotationScan>;
}

const readModule = createFileCache<ModuleEntry>(source => ({ source, scans: new Map() }));

/** Walks out through enclosing scopes the same way a reference itself resolves. */
export function findVariable(scope: OxlintScope, name: string): OxlintVariable | undefined {
    for (let current: OxlintScope | null = scope; current != null; current = current.upper) {
        const found = current.variables.find(variable => variable.name === name);
        if (found != null) {
            return found;
        }
    }

    return undefined;
}

/** Whether a comment block right before `node` (or the `export` wrapping it) carries the annotation. */
export function hasAnnotationInFile(context: OxlintRuleContext, node: OxlintNode): boolean {
    const comments = context.sourceCode.getCommentsBefore(exportWrapperOf(context, node));
    return comments.some(comment => comment.value.includes(NO_SIDE_EFFECTS_ANNOTATION));
}

/**
 * Whether `exportName` of `file` is declared with the annotation, following re-exports through
 * `resolve` — a barrel's `export *` and `export { a as b } from` chains end at the declaration.
 */
export function isAnnotatedExport(file: string, exportName: string, resolve: SpecifierResolver): boolean {
    return isAnnotatedExportWithin(file, exportName, resolve, MAX_REEXPORT_HOPS);
}

function isAnnotatedExportWithin(
    file: string,
    exportName: string,
    resolve: SpecifierResolver,
    hopsLeft: number,
): boolean {
    if (hopsLeft <= 0) {
        return false;
    }

    const scan = scanExport(file, exportName);
    if (scan.kind === 'annotated') {
        return true;
    }

    if (scan.kind === 'reexport') {
        for (const hop of scan.hops) {
            const target = resolve(file, hop.specifier);
            if (target != null && isAnnotatedExportWithin(target, hop.exportName, resolve, hopsLeft - 1)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * The node the JSDoc actually precedes.
 *
 * `export function f() {}` wraps the declaration in an `ExportNamedDeclaration`, and the comment
 * sits before that wrapper — asking for the comments before the inner declaration returns only what
 * stands between the `export` keyword and the function, which is nothing.
 */
function exportWrapperOf(context: OxlintRuleContext, node: OxlintNode): OxlintNode {
    const ancestors = context.sourceCode.getAncestors(node);
    const parent = ancestors.at(-1);

    return parent != null && EXPORT_DECLARATIONS.has(parent.type) ? parent : node;
}

function scanExport(file: string, exportName: string): ExportAnnotationScan {
    const entry = readModule(file);
    if (entry == null) {
        return { kind: 'absent' };
    }

    let scan = entry.scans.get(exportName);
    if (scan == null) {
        scan = scanExportAnnotation(entry.source, exportName);
        entry.scans.set(exportName, scan);
    }

    return scan;
}
