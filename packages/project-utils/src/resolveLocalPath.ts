import { fileURLToPath } from 'node:url';

/** Returns a resolver function that resolves paths relative to the calling module. */
export function resolveLocalPath(meta: ImportMeta): (path: string) => string;
/** Resolves a path relative to the calling module's location. */
export function resolveLocalPath(meta: ImportMeta, path: string): string;
/** Resolves a path relative to the calling module, or returns a curried resolver if no path is given. */
export function resolveLocalPath(meta: ImportMeta, path?: string) {
    if (path === undefined) {
        return (relativePath: string) => resolveLocalPath(meta, relativePath);
    }

    return fileURLToPath(new URL(path, meta.url));
}
