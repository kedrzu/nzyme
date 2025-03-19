declare module 'rollup-plugin-terser' {
    import type { Plugin } from 'rollup';
    import type { MinifyOptions } from 'terser';

    export function terser(options?: MinifyOptions): Plugin;
}
