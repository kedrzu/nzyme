import { readFile } from 'fs/promises';

import * as ts from 'typescript';

/**
 * Parsed TypeScript interface or type alias from a .type.ts file
 */
export interface ParsedTypeDefinition {
    /**
     *
     */
    name: string;
    /**
     *
     */
    node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
    /**
     *
     */
    jsDoc?: ts.JSDoc;
}

/**
 * Result of parsing a TypeScript type file
 */
export interface ParseTypeFileResult {
    /**
     *
     */
    sourceFile: ts.SourceFile;
    /**
     *
     */
    definitions: ParsedTypeDefinition[];
}

/**
 * Parse a TypeScript .type.ts file into AST nodes
 * @param filePath Path to the .type.ts file to parse
 * @returns Parsed AST with type definitions
 * @__NO_SIDE_EFFECTS__
 */
export async function parseTypeFile(filePath: string): Promise<ParseTypeFileResult> {
    const content = await readFile(filePath, 'utf-8');

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const definitions: ParsedTypeDefinition[] = [];

    // Visit all nodes to find interface and type alias declarations
    function visitNode(node: ts.Node): void {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
            const jsDoc = getJSDocForNode(node);
            definitions.push({
                name: node.name.text,
                node,
                jsDoc,
            });
        }

        ts.forEachChild(node, visitNode);
    }

    visitNode(sourceFile);

    return {
        sourceFile,
        definitions,
    };
}

/**
 * Extract JSDoc comment for a TypeScript node
 * @param node The TypeScript node to extract JSDoc from
 * @returns JSDoc node if found
 * @__NO_SIDE_EFFECTS__
 */
function getJSDocForNode(node: ts.Node): ts.JSDoc | undefined {
    // Use TypeScript's built-in JSDoc handling
    const jsDocs = ts.getJSDocCommentsAndTags(node);
    if (jsDocs && jsDocs.length > 0) {
        const jsDoc = jsDocs.find(j => ts.isJSDoc(j));
        return jsDoc && ts.isJSDoc(jsDoc) ? jsDoc : undefined;
    }

    return undefined;
}
