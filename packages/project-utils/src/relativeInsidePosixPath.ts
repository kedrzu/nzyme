import path from 'node:path';

/**
 * The path from `root` to `target` as {@link path.relative} computes it, with the host separator
 * replaced by `/` (`''` for `root` itself), or `null` when `target` is outside `root`.
 *
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function relativeInsidePosixPath(root: string, target: string): string | null {
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return null;
    }
    return relative.split(path.sep).join('/');
}
