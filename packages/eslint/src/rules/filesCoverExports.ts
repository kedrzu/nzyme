import type { Rule } from 'eslint';
import type { AST } from 'jsonc-eslint-parser';

import { propertyName, publishedPackageRoot } from './jsonPackage.js';

/**
 * ESLint rule for `package.json`: in a published package that declares `files`, every `exports`,
 * `main` and `types` target must be covered by `files`, otherwise the tarball ships without the
 * entry point it advertises.
 *
 * Targets of the `source` condition are exempt (they point at `src`, which is deliberately not
 * published), and so are private packages and packages without `files` (npm then ships everything).
 */
export const filesCoverExports: Rule.RuleModule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            notShipped:
                '"{{target}}" is not covered by "files", so it is missing from the published package. Add the directory or file that contains it (for example "{{suggestion}}") to "files".',
        },
    },
    create(context) {
        return {
            'Program:exit'() {
                const root = publishedPackageRoot(context);
                if (!root) {
                    return;
                }
                const filesProperty = root.properties.find(property => propertyName(property) === 'files');
                if (!filesProperty || filesProperty.value.type !== 'JSONArrayExpression') {
                    return;
                }
                const patterns = filesProperty.value.elements.flatMap(element =>
                    element?.type === 'JSONLiteral' && typeof element.value === 'string' ? [element.value] : [],
                );
                const matchers = patterns.filter(pattern => !pattern.startsWith('!')).map(toMatcher);

                for (const property of root.properties) {
                    const name = propertyName(property);
                    if (name === 'exports') {
                        collectTargets(property.value, targets => check(targets, matchers));
                    } else if (name === 'main' || name === 'types') {
                        check([property.value], matchers);
                    }
                }
            },
        };

        function check(nodes: AST.JSONExpression[], matchers: Array<(path: string) => boolean>): void {
            for (const node of nodes) {
                if (node.type !== 'JSONLiteral' || typeof node.value !== 'string') {
                    continue;
                }
                const path = normalize(node.value);
                if (path === 'package.json' || matchers.some(matches => matches(path))) {
                    continue;
                }
                const top = path.split('/')[0] ?? path;
                context.report({
                    loc: node.loc,
                    messageId: 'notShipped',
                    data: { target: node.value, suggestion: path.includes('/') ? top : path },
                });
            }
        }
    },
};

/** Calls `visit` with every string-valued target in an `exports` value, skipping `source` conditions. */
function collectTargets(value: AST.JSONExpression, visit: (targets: AST.JSONExpression[]) => void): void {
    if (value.type === 'JSONObjectExpression') {
        for (const property of value.properties) {
            const name = propertyName(property);
            if (name !== 'source' || name.startsWith('.')) {
                collectTargets(property.value, visit);
            }
        }
    } else if (value.type === 'JSONArrayExpression') {
        for (const element of value.elements) {
            if (element) {
                collectTargets(element, visit);
            }
        }
    } else {
        visit([value]);
    }
}

function normalize(path: string): string {
    return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

/** A `files` entry covers a path when it equals it, is a directory containing it, or is a glob matching it. */
function toMatcher(pattern: string): (path: string) => boolean {
    const entry = normalize(pattern);
    if (!entry.includes('*')) {
        return path => path === entry || path.startsWith(`${entry}/`);
    }
    const source = entry
        .split('**')
        .map(part => part.split('*').map(escapeRegExp).join('[^/]*'))
        .join('.*');
    const regExp = new RegExp(`^${source}(/.*)?$`);
    return path => regExp.test(path);
}

function escapeRegExp(text: string): string {
    return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
