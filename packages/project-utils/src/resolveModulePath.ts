import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 *
 */
export function resolveModulePath(moduleName: string, cwd: string): string;
/**
 *
 */
export function resolveModulePath(moduleName: string, meta?: ImportMeta): string;
/**
 *
 */
export function resolveModulePath(moduleName: string, metaOrCwd?: string | ImportMeta) {
    if (typeof metaOrCwd === 'string') {
        return createRequire(metaOrCwd).resolve(moduleName);
    }

    if (metaOrCwd) {
        return fileURLToPath(metaOrCwd.resolve(moduleName));
    }

    if (typeof require !== 'undefined') {
        return require.resolve(moduleName);
    }

    return fileURLToPath(import.meta.resolve(moduleName));
}
