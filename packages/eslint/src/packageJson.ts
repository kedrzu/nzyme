import packageJsonPlugin from 'eslint-plugin-package-json';
import { defineConfig } from 'eslint/config';

export function packageJson() {
    return defineConfig({
        plugins: {
            packageJson: packageJsonPlugin,
        },
        rules: {
            'package-json/require-name': 'off',
            'package-json/require-version': 'off',
        },
    });
}
