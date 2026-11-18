import type { Package } from './getPackages.js';
import { relativePosixPath } from './relativePosixPath.js';

/**
 * The `root`-relative POSIX directories of `packages`, leaving out the root package itself and any
 * package outside `root`.
 *
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getPackageDirs(root: string, packages: readonly Package[]): string[] {
    return packages.map(pkg => relativePosixPath(root, pkg.path)).filter(dir => dir !== '' && !dir.startsWith('..'));
}
