import { statSync } from 'node:fs';

/** Whether `path` exists and is a regular file. */
export function isFile(path: string): boolean {
    return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
