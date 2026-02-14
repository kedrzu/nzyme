declare module 'eslint-plugin-workspaces' {
    import type { ESLint } from 'eslint';

    const plugin: ESLint.Plugin;
    export default plugin;
}

declare module 'eslint-plugin-monorepo' {
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

    export /**
     *
     */
    const configs: {
        /**
         *
         */
        recommended: ESLint.Config;
    };
}
