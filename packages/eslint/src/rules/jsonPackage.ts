import type { Rule } from 'eslint';
import type { AST } from 'jsonc-eslint-parser';

/** Reads the name of a `jsonc-eslint-parser` property key. */
export function propertyName(property: AST.JSONProperty): string {
    const key = property.key;
    return key.type === 'JSONLiteral' ? String(key.value) : key.name;
}

/**
 * Returns the top-level object of a `package.json` AST, or `null` when the package is private (private
 * packages are never published, so publishing rules skip them).
 */
export function publishedPackageRoot(context: Rule.RuleContext): AST.JSONObjectExpression | null {
    // The AST root is a jsonc-eslint-parser node, which ESLint's ESTree types do not know.
    const body: unknown = context.sourceCode.ast.body[0];
    if (!isJsonStatement(body) || body.expression.type !== 'JSONObjectExpression') {
        return null;
    }
    const root = body.expression;
    const isPrivate = root.properties.some(
        property =>
            propertyName(property) === 'private' &&
            property.value.type === 'JSONLiteral' &&
            property.value.value === true,
    );
    return isPrivate ? null : root;
}

function isJsonStatement(node: unknown): node is AST.JSONExpressionStatement {
    return typeof node === 'object' && node !== null && 'type' in node && node.type === 'JSONExpressionStatement';
}
