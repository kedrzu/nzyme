import * as jsoncParser from 'jsonc-eslint-parser';
import { defineConfig } from 'eslint/config';
import { exportsSourceFirst } from './rules/exportsSourceFirst.js';

/**
 * Creates an ESLint config for `package.json` files.
 *
 * Files are parsed with `jsonc-eslint-parser`, the parser `eslint-plugin-package-json` rules
 * require too, so further `package.json` checks can share this config block.
 */
export function packageJson() {
    return defineConfig({
        files: ['**/package.json'],
        plugins: {
            nzyme: { rules: { 'exports-source-first': exportsSourceFirst } },
        },
        languageOptions: {
            parser: jsoncParser,
        },
        rules: {
            'nzyme/exports-source-first': 'error',
        },
    });
}
