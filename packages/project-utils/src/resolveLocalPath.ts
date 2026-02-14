import { fileURLToPath } from 'node:url';

export /**
 *
 */
function resolveLocalPath(meta: ImportMeta): (path: string) => string;
export /**
 *
 */
function resolveLocalPath(meta: ImportMeta, path: string): string;
/**
 *
 */
export function resolveLocalPath(meta: ImportMeta, path?: string) {
    if (path === undefined) {
        return (path: string) => resolveLocalPath(meta, path);
    }

    return fileURLToPath(new URL(path, meta.url));
}
