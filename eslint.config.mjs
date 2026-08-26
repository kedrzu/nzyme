import { vue } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

// ESLint covers Vue rules only; everything else is oxlint's (see `.oxlintrc.json`).
export default [globalIgnores(['**/dist/**', '**/.output/**', '**/.nuxt/**', '**/*.loc.ts']), ...vue()];
