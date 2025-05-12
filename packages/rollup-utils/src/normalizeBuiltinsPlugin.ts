import type { Plugin } from 'rollup';

/**
 */
export function normalizeBuiltinsPlugin(): Plugin {
    return {
        name: 'normalize-builtins',
        resolveId(source) {
            if (source.startsWith('node:')) {
                return { id: source.slice(5), external: true };
            }
        },
    };
}
