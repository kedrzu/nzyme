import { readFile } from 'node:fs/promises';

import type { Plugin } from 'vite';

import { compileSvgComponent } from './compileSvgComponent.js';
import type { SvgComponentSvgoConfig } from './compileSvgComponent.js';

/** Options of {@link svgVuePlugin}. */
export interface SvgVuePluginOptions {
    /** svgo config for every SVG component; `preset-default` when omitted. */
    svgo?: SvgComponentSvgoConfig;
}

const COMPONENT_QUERY = '?component';

/**
 * Vite plugin compiling `*.svg?component` imports into static Vue functional components (see
 * {@link compileSvgComponent}). Every other SVG import — plain, `?url`, `?raw`, `?component&…` —
 * is left to Vite. Add `@nzyme/vite-svg-vue/client` to `types` for the import's type.
 * @__NO_SIDE_EFFECTS__
 */
export function svgVuePlugin(options: SvgVuePluginOptions = {}): Plugin {
    return {
        name: 'nzyme:svg-vue',
        enforce: 'pre',
        async load(id) {
            if (!id.endsWith(`.svg${COMPONENT_QUERY}`)) {
                return undefined;
            }

            const path = id.slice(0, -COMPONENT_QUERY.length);
            let source: string;
            try {
                source = await readFile(path, 'utf8');
            } catch (error) {
                return this.error(new Error(`Cannot read SVG component ${path}`, { cause: error }));
            }

            try {
                return compileSvgComponent(source, { path, svgo: options.svgo });
            } catch (error) {
                return this.error(error instanceof Error ? error : String(error));
            }
        },
    };
}
