import { readFile } from 'node:fs/promises';

import { isErrorCode } from './isErrorCode.js';

/**
 * The bytes of the file, or `null` when there is no file at `path`; any other read error throws.
 * @util
 */
export async function readFileIfExists(path: string): Promise<Buffer | null> {
    try {
        return await readFile(path);
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}
