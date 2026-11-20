import { relative } from 'node:path';

/**
 * Whether `path` lies strictly inside `root` (not `root` itself, not beside it).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isInside(root: string, path: string): boolean {
    const rel = relative(root, path);
    return rel !== '' && !rel.startsWith('..');
}
