import type { OxlintNode, OxlintNodeTypes } from './oxlintTypes.js';

/**
 * Narrows an AST node to the shape that goes with its `type`.
 *
 * oxlint does not export its AST types, so the node union cannot be declared as a discriminated
 * one and `node.type === 'CallExpression'` narrows nothing on its own. This predicate is the single
 * place that bridges that gap, instead of a cast at every field access.
 */
export function isNode<TType extends keyof OxlintNodeTypes>(
    node: OxlintNode,
    type: TType,
): node is OxlintNodeTypes[TType] {
    return node.type === type;
}
