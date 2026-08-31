import { fileURLToPath } from 'node:url';

/**
 * Replacement for __filename in ESM context.
 * @example const __filename = filename(import.meta.url);
 */
export function filename(url: string) {
    return fileURLToPath(url);
}

export { filename as getFilename };
