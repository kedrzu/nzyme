import packageJsonPlugin from 'eslint-plugin-package-json';

export function packageJson() {
    return [packageJsonPlugin.configs.recommended];
}
