import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Common ESLint configuration for all projects
 */
export function common() {
    return defineConfig([globalIgnores(['dist/**/*', 'node_modules/**/*', '**/*.loc.ts'])]);
}
