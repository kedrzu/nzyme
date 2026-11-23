import { stat } from 'node:fs/promises';

import { isErrorCode } from './isErrorCode.js';

/**
 * Whether anything exists at `path` (a symlink counts by its target); errors other than a missing path throw.
 * @util
 */
export async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return false;
        }
        throw error;
    }
}
