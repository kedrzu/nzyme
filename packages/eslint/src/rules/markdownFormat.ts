import path from 'node:path';

import type { MarkdownRuleDefinition } from '@eslint/markdown';

import { isFileIgnored } from '@nzyme/project-utils/isFileIgnored.js';

import { formatMarkdown } from './formatMarkdown.js';

/**
 * ESLint rule for Markdown: the file must already be in the token-minimising format produced by
 * {@link formatMarkdown} (compact GFM tables, `-` bullets, no inert escapes, bare autolinks). An
 * unformatted file is reported once, on the document root, and the fix rewrites the whole file.
 *
 * Gitignored files are skipped: ESLint does not read `.gitignore`, and generated Markdown (code
 * indexes, local notes) is not ours to format.
 */
export const markdownFormat: MarkdownRuleDefinition = {
    meta: {
        type: 'layout',
        fixable: 'code',
        schema: [],
        messages: {
            unformatted: 'This Markdown file is not formatted. Run `bun lint` (or `eslint --fix`) to format it.',
        },
    },
    create(context) {
        const filename = context.filename;
        if (path.isAbsolute(filename) && isFileIgnored(filename) === true) {
            return {};
        }

        return {
            root(node) {
                const source = context.sourceCode.text;
                const formatted = formatMarkdown(source);
                if (formatted === source) {
                    return;
                }

                context.report({
                    node,
                    messageId: 'unformatted',
                    fix: fixer => fixer.replaceTextRange([0, source.length], formatted),
                });
            },
        };
    },
};
