import * as ts from 'typescript';

import type { IndexSymbol } from './IndexSymbol.js';
import { jsdocSummary } from './jsdocSummary.js';

/** Inputs for {@link extractUtil}. */
export interface ExtractUtilOptions {
    /** Parsed source file to scan (top-level statements only). */
    sourceFile: ts.SourceFile;
    /** Owning workspace package name, e.g. '@acme/utils'. */
    packageName: string;
    /** Repo-relative declaring file path, for {@link IndexSymbol.relPath}. */
    relPath: string;
    /** Deep import specifier for this file, from `importPathOf`. */
    importPath: string;
}

/**
 * Extracts every exported helper function tagged with a `@util` JSDoc tag from a source file's
 * top-level statements. Two forms are recognized: an `export function foo(...)` declaration (the
 * dominant form) and an `export const foo = (...) => ...` / `= function (...)` whose initializer
 * is an arrow function or function expression. The `@util` tag is detected structurally via
 * `ts.getJSDocTags` — a bare `@util` appearing in prose (not as a tag) does not qualify.
 *
 * The rendered `signature` is reconstructed from source text as `name(paramText, ...): returnText`
 * (each parameter's and the return type's `.getText`), with the return part omitted when there is
 * no explicit return type; the body and JSDoc are never included. Syntax-only — it never
 * type-checks and never throws on unexpected AST: non-matching statements are simply skipped.
 * @__NO_SIDE_EFFECTS__
 */
export function extractUtil(options: ExtractUtilOptions): IndexSymbol[] {
    const { sourceFile, packageName, relPath, importPath } = options;

    const symbols: IndexSymbol[] = [];
    for (const statement of sourceFile.statements) {
        const symbol = matchStatement(statement);
        if (symbol) {
            symbols.push(symbol);
        }
    }

    return symbols;

    function matchStatement(statement: ts.Statement): IndexSymbol | null {
        const match = matchFunction(statement);
        if (!match || !hasUtilTag(match.tagHost, sourceFile)) {
            return null;
        }

        return {
            kind: 'util',
            packageName,
            exportName: match.name,
            importPath,
            internalName: null,
            description: jsdocSummary(match.tagHost),
            signature: buildSignature(match.name, match.func),
            relPath,
        };
    }

    /**
     * Resolves an exported function statement into its name, the function-like node (for the
     * signature), and the node whose JSDoc/tags carry the `@util` tag. Returns null for anything
     * that isn't an exported function declaration or an exported const arrow/function expression.
     */
    function matchFunction(statement: ts.Statement): {
        name: string;
        func: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression;
        tagHost: ts.Node;
    } | null {
        if (ts.isFunctionDeclaration(statement)) {
            if (!hasExportModifier(statement.modifiers) || !statement.name) {
                return null;
            }
            return { name: statement.name.text, func: statement, tagHost: statement };
        }

        if (!ts.isVariableStatement(statement) || !hasExportModifier(statement.modifiers)) {
            return null;
        }

        const declaration = statement.declarationList.declarations[0];
        if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) {
            return null;
        }

        const initializer = declaration.initializer;
        if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) {
            return null;
        }

        // Tags live on the VariableStatement's JSDoc for `export const x = () => ...`.
        return { name: declaration.name.text, func: initializer, tagHost: statement };
    }

    /** Builds `name(param1, param2): returnType`, omitting the return part when absent. */
    function buildSignature(
        name: string,
        func: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
    ): string {
        const paramsText = func.parameters.map(parameter => parameter.getText(sourceFile)).join(', ');
        const returnText = func.type ? `: ${func.type.getText(sourceFile)}` : '';
        return `${name}(${paramsText})${returnText}`;
    }
}

/**
 * True when a genuine `@util` JSDoc tag is present on the node. The TypeScript JSDoc parser
 * turns any `@word` — even one appearing mid-sentence in prose — into a tag node, so a name match
 * alone is not enough. A real tag begins its own JSDoc line, so we additionally require that the
 * text between the line start and the tag's `@` be only JSDoc framing (whitespace / `*` / `/`).
 */
function hasUtilTag(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    return ts.getJSDocTags(node).some(tag => tag.tagName.text === 'util' && startsJSDocLine(tag, sourceFile));
}

/** True when the tag's `@` is preceded on its line only by JSDoc framing (whitespace, `*`, `/`). */
function startsJSDocLine(tag: ts.JSDocTag, sourceFile: ts.SourceFile): boolean {
    const fullText = sourceFile.getFullText();
    const tagStart = tag.getStart(sourceFile);

    let lineStart = tagStart;
    while (lineStart > 0 && fullText[lineStart - 1] !== '\n') {
        lineStart--;
    }

    return /^[\s*/]*$/.test(fullText.slice(lineStart, tagStart));
}

/** True when the modifier list carries the `export` keyword. */
function hasExportModifier(modifiers: ts.NodeArray<ts.ModifierLike> | undefined): boolean {
    return modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
