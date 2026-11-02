import markdownPlugin from '@eslint/markdown';
import { defineConfig } from 'eslint/config';

import { nzymePlugin } from './plugin.js';

/**
 * Creates an ESLint config for Markdown files.
 *
 * Files are parsed as GitHub-flavored Markdown with YAML frontmatter, and `nzyme/markdown-format`
 * keeps them in the token-minimising format: `eslint --fix` rewrites an unformatted file. Gitignored
 * files are skipped by the rule itself, because ESLint does not read `.gitignore`.
 */
export function markdown() {
    return defineConfig({
        files: ['**/*.md', '**/*.mdx'],
        plugins: { markdown: markdownPlugin, nzyme: nzymePlugin },
        language: 'markdown/gfm',
        languageOptions: { frontmatter: 'yaml' },
        rules: {
            'nzyme/markdown-format': 'error',
        },
    });
}
