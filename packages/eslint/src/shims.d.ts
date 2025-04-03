declare module 'eslint-plugin-workspaces' {
    import { ESLint } from 'eslint';
    const plugin: ESLint.Plugin;
    export default plugin;
}

declare module 'eslint-plugin-monorepo' {
    import { ESLint } from 'eslint';
    const plugin: ESLint.Plugin;
    export default plugin;
}

declare module 'eslint-plugin-import' {
    import { ESLint } from 'eslint';
    const plugin: ESLint.Plugin & {
        flatConfigs: {
            recommended: ESLint.Config;
            typescript: ESLint.Config;
            errors: ESLint.Config;
            warnings: ESLint.Config;
        };
    };
    export default plugin;
}

declare module 'eslint-plugin-package-json' {
    import { ESLint } from 'eslint';
    export const configs: {
        recommended: ESLint.Config;
    };
}
