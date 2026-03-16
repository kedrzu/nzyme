import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import dts from 'vite-plugin-dts';
import { libInjectCss } from 'vite-plugin-lib-inject-css';
import tsconfigPaths from 'vite-tsconfig-paths';

/** Options for configuring a Vue library build with Vite. */
export interface VueLibConfigOptions {
    /** Entry point(s) for the library build. */
    entry: string | string[];

    /** Whether to generate TypeScript declaration files. */
    declarations?: boolean;
}

/** Creates a Vite config for building a Vue component library with ES module output. */
export function vueLibConfig(options: VueLibConfigOptions) {
    return defineConfig({
        plugins: [
            vue(),
            vueJsx(),
            tsconfigPaths(),
            options.declarations ? dts({}) : undefined,
            checker({
                typescript: false,
                vueTsc: true,
            }),
            libInjectCss(),
        ],
        logLevel: 'warn',

        build: {
            minify: false,
            cssMinify: false,
            cssCodeSplit: true,
            emptyOutDir: false,
            lib: {
                entry: options.entry,
                formats: ['es'],
            },
            sourcemap: true,
            outDir: './dist',
            target: 'esnext',
            rollupOptions: {
                input: options.entry,
                external(id) {
                    if (/node_modules/.test(id)) {
                        return true;
                    }

                    return !id.startsWith('.') && !id.startsWith('/');
                },
                output: {
                    entryFileNames: `[name].js`,
                    chunkFileNames: `[name].js`,
                    assetFileNames: chunkInfo => {
                        if (chunkInfo.name?.endsWith('.css')) {
                            return `[name].css`;
                        }

                        return `[name].[hash].[ext]`;
                    },
                    preserveModules: true,
                },
            },
        },
    });
}
