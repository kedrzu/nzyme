import * as ts from 'typescript';

import type { DefineSymbolKind } from './IndexSettings.js';
import type { IndexSymbol } from './IndexSymbol.js';
import { jsdocSummary } from './jsdocSummary.js';

/** Inputs for {@link extractDefineSymbol}. */
export interface ExtractDefineSymbolOptions {
    /** Parsed source file to scan (top-level statements only). */
    sourceFile: ts.SourceFile;
    /** Owning workspace package name, e.g. '@acme/payments'. */
    packageName: string;
    /** Repo-relative declaring file path, for {@link IndexSymbol.relPath}. */
    relPath: string;
    /** Deep import specifier for this file, from `importPathOf`. */
    importPath: string;
    /** Callee identifier text → the `defineX` kind it marks (built in `collectSymbols`). */
    kindsByCallee: ReadonlyMap<string, DefineSymbolKind>;
}

/**
 * Extracts every `export const <Ident> = <defineX>({ ... })` DSL symbol from a source file's
 * top-level statements, where `<defineX>` is one of the known callees in `kindsByCallee`
 * (`defineService`/`defineCommand`/`defineFactory`/`defineEndpoint`, plus any configured ones). The
 * internal name is read from the first-argument object literal under the kind's `nameKey` (`name:`
 * unless configured otherwise); the description is the JSDoc summary above the `export const`.
 *
 * Syntax-only — it never type-checks and never throws on unexpected AST: statements that don't
 * match the exact shape (non-exported, non-Identifier callee like `defineEndpoint.output<T>()`
 * or `z.object(...)`, non-object argument, truncated calls) are simply skipped. A file may yield
 * several symbols; all matches are returned.
 * @__NO_SIDE_EFFECTS__
 */
export function extractDefineSymbol(options: ExtractDefineSymbolOptions): IndexSymbol[] {
    const { sourceFile, packageName, relPath, importPath, kindsByCallee } = options;

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

        // `export const X = ...` — a single declaration with an initializer.
        const declaration = statement.declarationList.declarations[0];
        if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) {
            return null;
        }

        const call = declaration.initializer;
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) {
            return null;
        }

        const kind = kindsByCallee.get(call.expression.text);
        if (!kind) {
            return null;
        }

        return {
            kind: kind.kind,
            packageName,
            exportName: declaration.name.text,
            importPath,
            internalName: readNameLiteral(call.arguments[0], kind.nameKey),
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

/**
 * Reads the string-literal value of property `nameKey` from a call's first argument object
 * literal (e.g. `name: 'PaymentClient'`). Returns null if the argument isn't an object literal,
 * the property is absent, or its value isn't a plain string literal.
 */
function readNameLiteral(argument: ts.Expression | undefined, nameKey: string): string | null {
    if (!argument || !ts.isObjectLiteralExpression(argument)) {
        return null;
    }

    for (const property of argument.properties) {
        if (!ts.isPropertyAssignment(property) || !propertyNameMatches(property.name, nameKey)) {
            continue;
        }
        if (ts.isStringLiteral(property.initializer)) {
            return property.initializer.text;
        }
        return null;
    }

    return null;
}

/** Matches an object-literal property key against a plain name, for identifier or string keys. */
function propertyNameMatches(name: ts.PropertyName, key: string): boolean {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
        return name.text === key;
    }
    return false;
}
