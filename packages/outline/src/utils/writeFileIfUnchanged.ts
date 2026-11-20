import { contentHash } from '../state/contentHash.js';
import { readFileIfExists } from './readFileIfExists.js';
import { writeFileAtomic } from './writeFileAtomic.js';

/**
 * Writes `content` to `path` unless the file is gone or no longer hashes to `startHash` (edited meanwhile).
 * Returns whether it wrote.
 * @util
 */
export async function writeFileIfUnchanged(path: string, startHash: string, content: string): Promise<boolean> {
    const current = await readFileIfExists(path);
    if (current == null || contentHash(current) !== startHash) {
        return false;
    }
    await writeFileAtomic(path, content);
    return true;
}
