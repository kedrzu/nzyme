import packageJsonPlugin from 'eslint-plugin-package-json';

export function packageJson() {
    return [
        packageJsonPlugin.configs.recommended,
        {
            rules: {
                'package-json/require-name': 'off',
                'package-json/require-version': 'off',
            },
        },
    ];
}
