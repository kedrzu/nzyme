declare module 'eslint-plugin-workspaces' {
    import type { ESLint } from 'eslint';

    const plugin: ESLint.Plugin;
    export default plugin;
}

declare module 'eslint-plugin-import' {
    import type { ESLint } from 'eslint';

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
    import type { ESLint } from 'eslint';

    /** Available ESLint configs from the package-json plugin. */
    export const configs: {
        /** The recommended config for package.json linting. */
        recommended: ESLint.Config;
    };
}
