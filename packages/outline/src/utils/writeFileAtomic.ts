import { mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Writes to a temp file in the same folder and renames it over `path`, so a crash leaves the old or the new
 * content, never a half. Creates the folder when missing.
 * @util
 */
export async function writeFileAtomic(path: string, content: string | Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    const file = await open(temp, 'w');
    try {
        await file.writeFile(content);
        await file.sync();
    } finally {
        await file.close();
    }
    await rename(temp, path);
}
