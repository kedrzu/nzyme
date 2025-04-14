import * as path from 'path';
import { fileURLToPath } from 'url';

import { copy } from 'fs-extra';
import type { Plugin } from 'rollup';

/**
 * Configuration options for the Prisma plugin.
 */
export type PrismaPluginOptions = {
    /**
     * The import.meta object for resolving module paths
     */
    importMeta?: ImportMeta;
    /**
     * The import path to the Prisma client
     */
    prismaImport: string;
};

/**
 * Creates a Rollup plugin that handles Prisma client bundling.
 * This plugin:
 * - Resolves Prisma client imports
 * - Copies Prisma schema and client files to the output directory
 * - Handles Prisma client initialization
 *
 * @param options - Configuration options for the plugin
 * @returns A Rollup plugin that handles Prisma client bundling
 */
export function prismaPlugin(options: PrismaPluginOptions): Plugin {
    const importMeta = options.importMeta ?? import.meta;
    const prismaPackage = fileURLToPath(importMeta.resolve(options.prismaImport));

    return {
        name: 'prisma',
        resolveId(id) {
            if (id === '@toyclub/database/prisma') {
                return {
                    id: './prisma/index.js',
                    external: 'relative',
                };
            }

            if (id === '.prisma/client/default') {
                return '.prisma/client/default';
            }
        },

        load(id) {
            if (id === '.prisma/client/default') {
                return {
                    code: 'export {};',
                    moduleSideEffects: false,
                };
            }
        },

        async writeBundle(options) {
            const prismaDir = path.dirname(prismaPackage);

            if (options.dir) {
                await copy(prismaDir, path.join(options.dir, 'prisma'));
            }
        },
    };
}
