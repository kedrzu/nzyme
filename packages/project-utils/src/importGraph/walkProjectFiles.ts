import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { isFileIgnored } from '../isFileIgnored.js';

/**
 * Lists every file under `root` that git does not ignore (`.gitignore` files, nested ones and
 * negations included, as {@link isFileIgnored} evaluates them), as sorted root-relative
 * `/`-separated paths. An ignored directory is pruned, not walked. `ignore` prunes more: it gets the
 * root-relative path of each file and directory and returns `true` to skip it.
 *
 * Symbolic links are not followed, nor listed. A missing or unreadable `root` yields `[]`.
 */
export async function walkProjectFiles(root: string, ignore?: (relativePath: string) => boolean): Promise<string[]> {
    const files: string[] = [];
    await walkDirectory('');
    return files.toSorted();

    async function walkDirectory(relativeDir: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
        } catch {
            return;
        }

        await Promise.all(
            entries.map(async entry => {
                const isDirectory = entry.isDirectory();
                if (!isDirectory && !entry.isFile()) {
                    return;
                }

                const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
                if (ignore?.(relativePath) || isFileIgnored(path.join(root, relativePath)) === true) {
                    return;
                }

                if (isDirectory) {
                    await walkDirectory(relativePath);
                } else {
                    files.push(relativePath);
                }
            }),
        );
    }
}
