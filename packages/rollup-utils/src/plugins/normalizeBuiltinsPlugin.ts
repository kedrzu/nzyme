import type { Plugin } from 'rollup';

/** Rollup plugin that strips the `node:` prefix from built-in module imports and marks them external. */
export function normalizeBuiltinsPlugin(): Plugin {
    return {
        name: 'normalize-builtins',
        resolveId(source) {
            if (source.startsWith('node:')) {
                return { id: source.slice(5), external: true };
            }

            return undefined;
        },
    };
}
