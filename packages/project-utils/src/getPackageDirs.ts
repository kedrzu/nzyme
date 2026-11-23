import type { Package } from './getPackages.js';
import { relativeInsidePosixPath } from './relativeInsidePosixPath.js';

/**
 * The `root`-relative POSIX directories of `packages`, leaving out the root package itself and any
 * package outside `root`.
 *
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getPackageDirs(root: string, packages: readonly Package[]): string[] {
    return packages.flatMap(pkg => {
        const dir = relativeInsidePosixPath(root, pkg.path);
        return dir === null || dir === '' ? [] : [dir];
    });
}
