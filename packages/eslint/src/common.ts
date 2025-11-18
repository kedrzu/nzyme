import { defineConfig, globalIgnores } from 'eslint/config';

export function common() {
    return defineConfig([globalIgnores(['dist/**/*', 'dist-*/**/*', 'node_modules/**/*', '**/*.loc.ts'])]);
}
