import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { FileAccess } from './FileAccess.js';
import { isSecretFile } from './isSecretFile.js';

/** Options of {@link assertFileAccess}. */
export interface AssertFileAccessOptions {
    /** The path with symlinks already resolved. */
    real: string;
    /** The path as the user gave it, for the error message. */
    shown: string;
    access: FileAccess;
    verb: 'read' | 'write';
}

/**
 * Throws unless a resolved path lies inside one of the access roots (themselves resolved, so a root
 * reached through a symlink still counts) and is not a secrets file.
 * @util
 */
export async function assertFileAccess({ real, shown, access, verb }: AssertFileAccessOptions): Promise<void> {
    const roots = await Promise.all(access.roots.map(root => fs.realpath(root).catch(() => null)));
    if (!roots.some(root => root !== null && isInside(real, root))) {
        throw new Error(
            `'${shown}' is outside the directories this command may ${verb} (${access.roots.join(', ')}). ` +
                'Use a path inside the project directory.',
        );
    }

    if (isSecretFile(real)) {
        throw new Error(`'${shown}' looks like a secrets file - refusing to ${verb} it`);
    }
}

function isInside(filePath: string, root: string) {
    const rel = path.relative(root, filePath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
