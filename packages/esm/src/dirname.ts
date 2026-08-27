import { fileURLToPath } from 'node:url';

/**
 * Replacement for __dirname in ESM context.
 * @example const __dirname = dirname(import.meta);
 */
export function dirname(url: string): string {
    return fileURLToPath(new URL('.', url));
}

export { dirname as getDirname };
