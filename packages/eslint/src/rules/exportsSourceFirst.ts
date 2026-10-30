import type { Rule } from 'eslint';
import type { AST } from 'jsonc-eslint-parser';

import { assert } from '@nzyme/utils';

import { propertyName } from './jsonPackage.js';

const DECISION = 'docs/decisions/workspace-code-generators-run-from-source.md in the healed repository';

/**
 * ESLint rule for `package.json`: every conditions object inside `exports` that points a runtime
 * condition into `dist` must have a `source` condition, placed directly after `types` (or first when
 * there is no `types`).
 *
 * Node and Bun match conditions in key order, so `bun --conditions=source` (used to run code
 * generators from source, without building anything first) only reaches `source` when no other
 * runtime condition comes before it. Reordering an existing `source` is autofixed; a missing one is
 * only reported, because its `src` path cannot be guessed safely.
 */
export const exportsSourceFirst: Rule.RuleModule = {
    meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: {
            missing: `This "exports" conditions object points into dist but has no "source" condition, so \`bun --conditions=source\` (used to run code generators from source) falls through to dist. Add "source" pointing at the matching file under src, directly after "types". See ${DECISION}.`,
            misplaced: `"source" must come directly after "types" (or first without "types") and before every runtime condition: \`bun --conditions=source\` (used to run code generators from source) matches conditions in key order and never reaches "source" when "import" or "default" comes first. See ${DECISION}.`,
        },
    },
    create(context) {
        const sourceCode = context.sourceCode;

        function check(object: AST.JSONObjectExpression): void {
            const properties = object.properties;
            const isSubpaths = properties.some(property => propertyName(property).startsWith('.'));

            if (!isSubpaths && pointsIntoDist(properties)) {
                const sourceIndex = properties.findIndex(property => propertyName(property) === 'source');
                if (sourceIndex === -1) {
                    context.report({ loc: object.loc, messageId: 'missing' });
                } else {
                    const first = properties[0];
                    assert(first);
                    const desiredIndex = propertyName(first) === 'types' ? 1 : 0;
                    if (sourceIndex !== desiredIndex) {
                        reportMisplaced(properties, sourceIndex, desiredIndex);
                    }
                }
            }

            for (const property of properties) {
                if (property.value.type === 'JSONObjectExpression') {
                    check(property.value);
                }
            }
        }

        function reportMisplaced(properties: AST.JSONProperty[], sourceIndex: number, desiredIndex: number): void {
            const property = properties[sourceIndex];
            assert(property);
            context.report({
                loc: property.loc,
                messageId: 'misplaced',
                fix(fixer) {
                    const from = Math.min(sourceIndex, desiredIndex);
                    const to = Math.max(sourceIndex, desiredIndex);
                    const affected = properties.slice(from, to + 1);
                    const head = affected[0];
                    const tail = affected.at(-1);
                    assert(head);
                    assert(tail);
                    const reordered = [...affected];
                    reordered.splice(sourceIndex - from, 1);
                    reordered.splice(desiredIndex - from, 0, property);
                    // Keep each separator (comma, whitespace, comments) in its original slot.
                    let text = '';
                    reordered.forEach((moved, i) => {
                        text += sourceCode.text.slice(...moved.range);
                        const current = affected[i];
                        assert(current);
                        const next = affected[i + 1];
                        if (next) {
                            text += sourceCode.text.slice(current.range[1], next.range[0]);
                        }
                    });
                    return fixer.replaceTextRange([head.range[0], tail.range[1]], text);
                },
            });
        }

        return {
            JSONProperty(visited: Rule.Node) {
                // The visited node is a jsonc-eslint-parser node, which ESLint's ESTree types do not know.
                const node: unknown = visited;
                if (!isJsonProperty(node)) {
                    return;
                }
                const parent = node.parent;
                const isRoot =
                    parent.type === 'JSONObjectExpression' && parent.parent.type === 'JSONExpressionStatement';
                if (isRoot && propertyName(node) === 'exports' && node.value.type === 'JSONObjectExpression') {
                    check(node.value);
                }
            },
        };
    },
};

function isJsonProperty(node: unknown): node is AST.JSONProperty {
    return typeof node === 'object' && node !== null && 'type' in node && node.type === 'JSONProperty';
}

/** Whether any runtime condition (everything but `types`) targets a file in `dist`. */
function pointsIntoDist(properties: AST.JSONProperty[]): boolean {
    return properties.some(property => {
        const value = property.value;
        return (
            propertyName(property) !== 'types' &&
            value.type === 'JSONLiteral' &&
            typeof value.value === 'string' &&
            /^\.\/dist(\/|$)/.test(value.value)
        );
    });
}
