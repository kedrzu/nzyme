import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Resolves a module path from a given working directory. */
export function resolveModulePath(moduleName: string, cwd: string): string;
/** Resolves a module path relative to the given import.meta context. */
export function resolveModulePath(moduleName: string, meta?: ImportMeta): string;
/** Resolves the file path of a module using either a cwd string or import.meta. */
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
