import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export /**
 *
 */
function resolveModulePath(meta: ImportMeta): (moduleName: string) => string;
export /**
 *
 */
function resolveModulePath(moduleName: string, meta?: ImportMeta): string;
/**
 *
 */
export function resolveModulePath(moduleOrMeta: string | ImportMeta, meta?: ImportMeta) {
    if (typeof moduleOrMeta !== 'string') {
        meta = moduleOrMeta;
        return (moduleName: string) => resolveModulePath(moduleName, meta);
    }

    if (typeof require !== 'undefined') {
        return require.resolve(moduleOrMeta);
    }

    if (!meta) {
        meta = import.meta;
    }

    if (meta.resolve) {
        return fileURLToPath(meta.resolve(moduleOrMeta));
    }

    return createRequire(meta.url).resolve(moduleOrMeta);
}
