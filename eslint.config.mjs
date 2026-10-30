import { markdown, packageJson, vue } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

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
    ...vue(),
];
