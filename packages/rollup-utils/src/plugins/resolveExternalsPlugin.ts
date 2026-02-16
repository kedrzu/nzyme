import { isBuiltin } from 'node:module';

import type { Plugin } from 'rollup';

import { isFileExternal } from '../isFileExternal.js';

/**
 * Rollup plugin that resolves external (non-node-native) packages to their full
 * filesystem paths, removing dependency on local node_modules resolution at runtime.
 * Node built-ins are kept as bare specifiers.
 */
export function resolveExternalsPlugin(): Plugin {
    return {
        name: 'resolve-externals',
        async resolveId(source, importer, options) {
            if (!isFileExternal(source)) {
                return null;
            }

            if (isBuiltin(source)) {
                return { id: source, external: true };
            }

            const resolved = await this.resolve(source, importer, {
                ...options,
                skipSelf: true,
            });

            if (resolved && !resolved.external) {
                return { id: resolved.id, external: true };
            }

            return { id: source, external: true };
        },
    };
}
