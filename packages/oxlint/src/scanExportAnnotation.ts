/** The tree-shaking annotation this package's rule polices. */
export const NO_SIDE_EFFECTS_ANNOTATION = '@__NO_SIDE_EFFECTS__';

const IDENTIFIER = /^[$A-Z_a-z][\w$]*$/;
const NAMED_REEXPORT = /^export\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;
const STAR_REEXPORT = /^export\s+\*\s+from\s*['"]([^'"]+)['"]/gm;
const ALIAS_SEPARATOR = /\s+as\s+/;

/** One `export … from` edge to follow: where to look next, and under which name. */
export interface ExportReexportHop {
    /** Specifier exactly as written in the clause, e.g. `./helpers.js`. */
    specifier: string;
    /** Name to look for in that module — the pre-alias one for `export { a as b }`. */
    exportName: string;
}

/** What scanning one module's text said about a single named export. */
export type ExportAnnotationScan =
    /** Declared in this module, with the annotation in a comment block before it. */
    | { kind: 'annotated' }
    /** Declared here without the annotation, or not visible in this module at all. */
    | { kind: 'absent' }
    /** The name comes from elsewhere; the caller resolves and scans each hop in turn. */
    | { kind: 'reexport'; hops: ExportReexportHop[] };

/**
 * Classifies a named export of a module from that module's source text.
 *
 * Text scanning rather than parsing, as `resolveRelativeImport` in the repo's
 * `analyzeImportGraph.ts` does: a lint rule that has to look across a module boundary on every
 * statement-position call cannot afford to parse each target, and the annotation is a fixed string
 * inside a comment that no parse would read more reliably. Being text-based it errs toward
 * `absent` — a missed annotation only costs a report, while a wrong `annotated` would be a false
 * positive in everybody's `bun lint`.
 *
 * Only top-level declarations count (a declaration indented by its enclosing block is somebody's
 * local), and every comment block immediately before one is searched, so an annotation stacked in a
 * second block still registers.
 *
 * Pure and free of file access so that this classification — the part with all the edge cases — is
 * unit-testable on plain strings.
 */
export function scanExportAnnotation(source: string, exportName: string): ExportAnnotationScan {
    if (!IDENTIFIER.test(exportName)) {
        return { kind: 'absent' };
    }

    const declaration = findTopLevelDeclaration(source, exportName);
    if (declaration != null) {
        return hasAnnotationBefore(source, declaration) ? { kind: 'annotated' } : { kind: 'absent' };
    }

    const hops = collectReexportHops(source, exportName);
    return hops.length > 0 ? { kind: 'reexport', hops } : { kind: 'absent' };
}

/**
 * Offset of the top-level `function`/`const`/`let`/`var` declaration of `exportName`, with or
 * without the `export` keyword — a name can also be declared first and exported by a later clause.
 */
function findTopLevelDeclaration(source: string, exportName: string): number | undefined {
    const declaration = new RegExp(
        String.raw`^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var)\s+${exportName}\b`,
        'm',
    );

    return declaration.exec(source)?.index;
}

/** Whether any of the comment blocks running up to `index` carries the annotation. */
function hasAnnotationBefore(source: string, index: number): boolean {
    let before = source.slice(0, index).trimEnd();

    while (before.length > 0) {
        if (before.endsWith('*/')) {
            const start = before.lastIndexOf('/*');
            if (start < 0) {
                return false;
            }
            if (before.slice(start).includes(NO_SIDE_EFFECTS_ANNOTATION)) {
                return true;
            }
            before = before.slice(0, start).trimEnd();
            continue;
        }

        const lineStart = before.lastIndexOf('\n') + 1;
        const line = before.slice(lineStart);
        if (!line.trimStart().startsWith('//')) {
            return false;
        }
        if (line.includes(NO_SIDE_EFFECTS_ANNOTATION)) {
            return true;
        }
        before = before.slice(0, lineStart).trimEnd();
    }

    return false;
}

/**
 * Modules that might declare `exportName`, when this one only passes it through. A named clause
 * pins it down exactly; `export *` cannot, so every starred module becomes a candidate.
 */
function collectReexportHops(source: string, exportName: string): ExportReexportHop[] {
    for (const match of source.matchAll(NAMED_REEXPORT)) {
        const [, typeOnly, clause, specifier] = match;
        if (typeOnly != null || clause == null || specifier == null) {
            continue;
        }

        const original = findClauseOrigin(clause, exportName);
        if (original != null) {
            return [{ specifier, exportName: original }];
        }
    }

    const hops: ExportReexportHop[] = [];
    for (const match of source.matchAll(STAR_REEXPORT)) {
        const [, specifier] = match;
        if (specifier != null) {
            hops.push({ specifier, exportName });
        }
    }

    return hops;
}

/** The pre-alias name a clause exports as `exportName`, ignoring type-only entries. */
function findClauseOrigin(clause: string, exportName: string): string | undefined {
    for (const raw of clause.split(',')) {
        const entry = raw.trim();
        if (entry.length === 0 || entry.startsWith('type ')) {
            continue;
        }

        const [original, alias] = entry.split(ALIAS_SEPARATOR);
        if ((alias ?? original) === exportName) {
            return original;
        }
    }

    return undefined;
}
