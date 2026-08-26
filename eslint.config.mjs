import { vue } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

// ESLint covers Vue rules only; everything else is oxlint's (see `.oxlintrc.json`).
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
    ]),
    ...vue(),
];
