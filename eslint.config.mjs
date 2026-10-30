import { packageJson, vue } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

// ESLint covers Vue rules and package.json checks only; everything else is oxlint's (see `.oxlintrc.json`).
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
    ]),
    ...packageJson(),
    ...vue(),
];
