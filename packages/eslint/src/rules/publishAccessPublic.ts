import type { Rule } from 'eslint';

import { propertyName, publishedPackageRoot } from './jsonPackage.js';

/**
 * ESLint rule for `package.json`: a published package must set `publishConfig.access` to `"public"`.
 * `eslint-plugin-package-json`'s `require-publishConfig` only checks that `publishConfig` exists, and
 * a scoped package without `access: "public"` is published as restricted (or the publish fails).
 *
 * Private packages are skipped.
 */
export const publishAccessPublic: Rule.RuleModule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            missing: 'A published package must declare `"publishConfig": { "access": "public" }`.',
            notPublic: '`publishConfig.access` must be "public" in a published package.',
        },
    },
    create(context) {
        return {
            'Program:exit'() {
                const root = publishedPackageRoot(context);
                if (!root) {
                    return;
                }
                const publishConfig = root.properties.find(property => propertyName(property) === 'publishConfig');
                if (!publishConfig || publishConfig.value.type !== 'JSONObjectExpression') {
                    // A missing publishConfig is eslint-plugin-package-json's `require-publishConfig` to report.
                    if (publishConfig) {
                        context.report({ loc: publishConfig.loc, messageId: 'missing' });
                    }
                    return;
                }
                const access = publishConfig.value.properties.find(property => propertyName(property) === 'access');
                if (!access) {
                    context.report({ loc: publishConfig.loc, messageId: 'missing' });
                } else if (access.value.type !== 'JSONLiteral' || access.value.value !== 'public') {
                    context.report({ loc: access.loc, messageId: 'notPublic' });
                }
            },
        };
    },
};
