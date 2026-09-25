import { readFileSync } from 'node:fs';

import { isNode } from './isNode.js';
import type {
    OxlintCallExpression,
    OxlintDefinition,
    OxlintIdentifier,
    OxlintNode,
    OxlintRule,
    OxlintRuleContext,
    OxlintScope,
    OxlintVariable,
} from './oxlintTypes.js';
import { resolveImportSpecifier } from './resolveImportSpecifier.js';
import type { ExportAnnotationScan } from './scanExportAnnotation.js';
import { NO_SIDE_EFFECTS_ANNOTATION, scanExportAnnotation } from './scanExportAnnotation.js';

const MESSAGE_ID = 'unusedResult';

/** Real re-export chains are one or two modules deep; the cap only stops a cycle from hanging. */
const MAX_REEXPORT_HOPS = 5;

/** Wrappers that stand between a leading JSDoc block and the declaration it documents. */
const EXPORT_DECLARATIONS = new Set(['ExportDefaultDeclaration', 'ExportNamedDeclaration']);

/**
 * Source text of every module a call has crossed into, `undefined` for one that could not be read.
 * A single util is imported by hundreds of files, so without this the rule would re-read and
 * re-scan the same handful of modules on every one of them. Both caches live for the lint process,
 * which reads each file once.
 */
const sourceTextCache = new Map<string, string | undefined>();
const scanCache = new Map<string, ExportAnnotationScan>();

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
export const noUnusedNoSideEffectsResult: OxlintRule = {
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

/** Walks out through enclosing scopes the same way the reference itself resolves. */
function findVariable(scope: OxlintScope, name: string): OxlintVariable | undefined {
    for (let current: OxlintScope | null = scope; current != null; current = current.upper) {
        const found = current.variables.find(variable => variable.name === name);
        if (found != null) {
            return found;
        }
    }

    return undefined;
}

function hasAnnotationInFile(context: OxlintRuleContext, node: OxlintNode): boolean {
    const comments = context.sourceCode.getCommentsBefore(exportWrapperOf(context, node));
    return comments.some(comment => comment.value.includes(NO_SIDE_EFFECTS_ANNOTATION));
}

/**
 * The node the JSDoc actually precedes.
 *
 * `export function f() {}` wraps the declaration in an `ExportNamedDeclaration`, and the comment
 * sits before that wrapper — asking for the comments before the inner declaration returns only what
 * stands between the `export` keyword and the function, which is nothing. Most annotated functions
 * are exported, so without this the rule saw almost none of them in their own module.
 */
function exportWrapperOf(context: OxlintRuleContext, node: OxlintNode): OxlintNode {
    const ancestors = context.sourceCode.getAncestors(node);
    const parent = ancestors.at(-1);

    return parent != null && EXPORT_DECLARATIONS.has(parent.type) ? parent : node;
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

    return isAnnotatedExport(target, node.imported.name, MAX_REEXPORT_HOPS);
}

function isAnnotatedExport(file: string, exportName: string, hopsLeft: number): boolean {
    if (hopsLeft <= 0) {
        return false;
    }

    const scan = scanExport(file, exportName);
    if (scan.kind === 'annotated') {
        return true;
    }

    if (scan.kind === 'reexport') {
        for (const hop of scan.hops) {
            const target = resolveImportSpecifier(file, hop.specifier);
            if (target != null && isAnnotatedExport(target, hop.exportName, hopsLeft - 1)) {
                return true;
            }
        }
    }

    return false;
}

function scanExport(file: string, exportName: string): ExportAnnotationScan {
    const key = `${file}\u0000${exportName}`;
    const cached = scanCache.get(key);
    if (cached != null) {
        return cached;
    }

    const source = readSource(file);
    const scan: ExportAnnotationScan = source == null ? { kind: 'absent' } : scanExportAnnotation(source, exportName);
    scanCache.set(key, scan);

    return scan;
}

/** `undefined` when the file cannot be read — a module generated or deleted since, not an error. */
function readSource(file: string): string | undefined {
    if (sourceTextCache.has(file)) {
        return sourceTextCache.get(file);
    }

    let source: string | undefined;
    try {
        source = readFileSync(file, 'utf8');
    } catch {
        source = undefined;
    }
    sourceTextCache.set(file, source);

    return source;
}
