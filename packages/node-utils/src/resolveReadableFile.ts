import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { assertFileAccess } from './assertFileAccess.js';
import { checkPathInput } from './checkPathInput.js';
import type { FileAccess } from './FileAccess.js';

/**
 * The real path of a regular file a command may read: resolved against `access.baseDir` with symlinks
 * followed, inside the access roots, and not a secrets file. Throws a message naming the path otherwise.
 * @util
 */
export async function resolveReadableFile(input: string, access: FileAccess): Promise<string> {
    const shown = checkPathInput(input);
    let real: string;
    try {
        real = await fs.realpath(path.resolve(access.baseDir, shown));
    } catch {
        throw new Error(`File not found: ${shown}`);
    }

    await assertFileAccess({ real, shown, access, verb: 'read' });
    const stat = await fs.stat(real);
    if (!stat.isFile()) {
        throw new Error(`'${shown}' is not a regular file`);
    }

    return real;
}
