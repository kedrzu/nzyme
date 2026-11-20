import { readFile } from 'node:fs/promises';

/**
 * The bytes of the file, or `null` when there is no file at `path`; any other read error throws.
 * @util
 */
export async function readFileIfExists(path: string): Promise<Buffer | null> {
    try {
        return await readFile(path);
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
