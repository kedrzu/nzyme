import { markdown, packageJson, vue } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';
import packageJsonPlugin from 'eslint-plugin-package-json';

// ESLint covers Vue rules, package.json checks and Markdown formatting only; everything else is oxlint's (see `.oxlintrc.json`).
export default [
    globalIgnores([
        '**/dist/**',
        '**/dist-cjs/**',
        '**/.output/**',
        '**/.nuxt/**',
        '**/storybook-static/**',
        '**/playwright-report/**',
        '**/*.loc.ts',
        '**/*.loc.js',
        // Agent worktrees are full checkouts of this repo; ESLint does not read .gitignore.
        '.claude/worktrees/**',
        // Agent scratch space and the generated changelog are not formatted.
        '.context/**',
        'CHANGELOG.md',
    ]),
    ...markdown(),
    ...packageJson(),
    // nzyme's own publishing policy (see Publishing in CLAUDE.md). Layers on the `packageJson()` parser block.
    {
        files: ['**/package.json'],
        plugins: { 'package-json': packageJsonPlugin },
        rules: {
            'package-json/require-license': ['error', { ignorePrivate: true }],
            'package-json/require-description': ['error', { ignorePrivate: true }],
            'package-json/require-repository': ['error', { ignorePrivate: true }],
            'package-json/require-publishConfig': ['error', { ignorePrivate: true }],
            'nzyme/publish-access-public': 'error',
        },
    },
    ...vue(),
];
