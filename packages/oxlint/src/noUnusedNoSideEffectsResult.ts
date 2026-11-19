import type { Immutable } from '@nzyme/types/Immutable.js';

import { isNode } from './isNode.js';
import { findVariable, hasAnnotationInFile, isAnnotatedExport } from './noSideEffectsDeclaration.js';
import type {
    OxlintCallExpression,
    OxlintDefinition,
    OxlintIdentifier,
    OxlintNode,
    OxlintRule,
    OxlintRuleContext,
} from './oxlintTypes.js';
import { resolveImportSpecifier } from './resolveImportSpecifier.js';

const MESSAGE_ID = 'unusedResult';

/**
 * Reports a call to an `@__NO_SIDE_EFFECTS__` function whose result nothing consumes.
 *
 * The annotation is a promise to the bundler that the call can be deleted when its result is
 * unused, and Rollup takes it: in the API bundle it removed the `selectClosestObservation` call
 * inside `deriveBmiObservations`, so BMI was silently never derived in the shipped build. Tests run
 * unbundled source, so nothing went red. A statement-position call to an annotated function is
 * therefore either dead code, or proof that the function has side effects and must lose the
 * annotation — which of the two is a judgement call, so this rule offers no fix and no suggestion.
 *
 * Only a call whose callee resolves to a declaration that really carries the annotation is
 * reported; matching on the name alone would fire on, say, every `defineProps()`. A callee imported
 * from a **bare** specifier (`@healed/x`, `@nzyme/x`) is out of scope: across both repos, none of
 * the ~26 600 statement-position calls has an identifier callee imported from a package whose name
 * matches any of the ~510 annotated ones, so resolving package entry points would add a
 * node_modules walk to every lint run for no finding.
 */
export const noUnusedNoSideEffectsResult: Immutable<OxlintRule> = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow calling a function annotated `@__NO_SIDE_EFFECTS__` as a statement, because a bundler may delete the call.',
        },
        messages: {
            [MESSAGE_ID]:
                '`{{name}}` is annotated `@__NO_SIDE_EFFECTS__`, so a bundler may delete this call. Use its result, or drop the annotation if the function really does have side effects.',
        },
    },
    create(context) {
        return {
            ExpressionStatement(node) {
                const call = unwrapDiscardedCall(node.expression);
                if (call == null || !isNode(call.callee, 'Identifier')) {
                    return;
                }

                if (!isAnnotatedCallee(context, call.callee)) {
                    return;
                }

                context.report({
                    messageId: MESSAGE_ID,
                    node,
                    data: { name: call.callee.name },
                });
            },
        };
    },
};

/**
 * The call inside a statement that throws its result away. `void fn()` says so explicitly, and
 * `await fn()` does not consume anything either — awaiting only unwraps a value that still has to
 * be assigned somewhere. `const x = await fn()` and `return await fn()` are not statements, so they
 * never reach here.
 */
function unwrapDiscardedCall(expression: OxlintNode): OxlintCallExpression | undefined {
    if (isNode(expression, 'CallExpression')) {
        return expression;
    }

    if (isNode(expression, 'AwaitExpression')) {
        return unwrapDiscardedCall(expression.argument);
    }

    if (isNode(expression, 'UnaryExpression') && expression.operator === 'void') {
        return unwrapDiscardedCall(expression.argument);
    }

    return undefined;
}

function isAnnotatedCallee(context: OxlintRuleContext, callee: OxlintIdentifier): boolean {
    const variable = findVariable(context.sourceCode.getScope(callee), callee.name);
    const definition = variable?.defs[0];
    if (definition == null) {
        return false;
    }

    switch (definition.type) {
        case 'FunctionName':
            return hasAnnotationInFile(context, definition.node);
        case 'Variable':
            // The JSDoc sits before the whole `const … = …` declaration, not its declarator.
            return hasAnnotationInFile(context, definition.parent ?? definition.node);
        case 'ImportBinding':
            return isAnnotatedImport(context, definition);
        default:
            // A parameter, a catch binding or a class name is never an annotated function.
            return false;
    }
}

function isAnnotatedImport(context: OxlintRuleContext, definition: OxlintDefinition): boolean {
    const { node, parent } = definition;
    // A default or namespace import is neither an `ImportSpecifier` nor a named export to look up.
    if (parent == null || !isNode(parent, 'ImportDeclaration') || !isNode(node, 'ImportSpecifier')) {
        return false;
    }

    if (!isNode(node.imported, 'Identifier')) {
        return false;
    }

    const target = resolveImportSpecifier(context.filename, parent.source.value);
    if (target == null) {
        return false;
    }

    return isAnnotatedExport(target, node.imported.name, resolveImportSpecifier);
}
