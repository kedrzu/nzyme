import packageJsonPlugin from 'eslint-plugin-package-json';
import { defineConfig } from 'eslint/config';
import jsonParser from 'jsonc-eslint-parser';

/**
 *
 */
export function packageJson() {
    return defineConfig({
        plugins: {
            packageJson: packageJsonPlugin,
        },
        files: ['package.json'],
        languageOptions: {
            parser: jsonParser,
        },
        rules: {
            'package-json/require-name': 'off',
            'package-json/require-version': 'off',
        },
    });
}
