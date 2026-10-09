import * as ts from 'typescript';

import type { IndexSymbol } from './IndexSymbol.js';
import { jsdocSummary } from './jsdocSummary.js';

/** Inputs for {@link extractEntity}. */
export interface ExtractEntityOptions {
    /** Parsed source file to scan (top-level statements only). */
    sourceFile: ts.SourceFile;
    /** Owning workspace package name — one of the configured entity packages (the caller gates). */
    packageName: string;
    /** Repo-relative declaring file path, for {@link IndexSymbol.relPath}. */
    relPath: string;
    /** Deep import specifier for this file, from `importPathOf`. */
    importPath: string;
    /** Table-builder callees that define an entity, e.g. Drizzle's `pgTable`. */
    tableFunctions: ReadonlySet<string>;
}

/**
 * Extracts every table entity — e.g. Drizzle's `export const <Ident> = pgTable('<tableName>', { ... })`
 * — from a source file's top-level statements, for each configured table-builder callee. The export
 * name is the const identifier (e.g. `payment`); the internal name is the first-argument string
 * literal (the physical table name). Only a bare identifier callee matches, so sibling
 * `enumType(...)` / property-access (`schema.pgTable(...)`) calls are skipped. When the first
 * argument is not a string literal the entity is still emitted with a null internal name, mirroring
 * the `defineX` extractor.
 *
 * Gating to the configured entity packages is the caller's responsibility; this extractor only
 * matches the call shape. Syntax-only — it never type-checks and never throws on unexpected AST.
 * @__NO_SIDE_EFFECTS__
 */
export function extractEntity(options: ExtractEntityOptions): IndexSymbol[] {
    const { sourceFile, packageName, relPath, importPath, tableFunctions } = options;

    const symbols: IndexSymbol[] = [];
    for (const statement of sourceFile.statements) {
        const symbol = matchStatement(statement);
        if (symbol) {
            symbols.push(symbol);
        }
    }

    return symbols;

    function matchStatement(statement: ts.Statement): IndexSymbol | null {
        if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
            return null;
        }

        const declaration = statement.declarationList.declarations[0];
        if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) {
            return null;
        }

        const call = declaration.initializer;
        if (
            !ts.isCallExpression(call) ||
            !ts.isIdentifier(call.expression) ||
            !tableFunctions.has(call.expression.text)
        ) {
            return null;
        }

        return {
            kind: 'entity',
            packageName,
            exportName: declaration.name.text,
            importPath,
            internalName: readStringLiteral(call.arguments[0]),
            description: jsdocSummary(statement),
            signature: null,
            relPath,
        };
    }
}

/** True when a statement carries the `export` modifier. */
function hasExportModifier(statement: ts.VariableStatement): boolean {
    return statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** Returns the text of a plain string-literal argument, or null when absent or not a string. */
function readStringLiteral(argument: ts.Expression | undefined): string | null {
    if (argument && ts.isStringLiteral(argument)) {
        return argument.text;
    }
    return null;
}
