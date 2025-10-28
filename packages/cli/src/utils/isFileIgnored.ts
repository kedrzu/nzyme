import path from 'path';

const ignored = ['node_modules', '.git', '.turbo', '.nx', '.yarn'].map(pattern => `/${pattern}`);

/**
 * Checks if a file is ignored by the file system watcher.
 */
export function isFileIgnored(file: string) {
    for (const pattern of ignored) {
        if (file.endsWith(pattern)) {
            return true;
        }
    }

    // Do not ignore directories
    if (!path.extname(file)) {
        return false;
    }
}
