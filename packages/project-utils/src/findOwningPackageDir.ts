/**
 * The directory of the package owning a root-relative path — the deepest of `packageDirs` containing
 * it, so a package nested in another owns its own files — or `''` (the root) outside every package.
 *
 * @param file - Root-relative, `/`-separated path.
 * @param packageDirs - Root-relative, `/`-separated package directories.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function findOwningPackageDir(file: string, packageDirs: readonly string[]): string {
    let owner = '';
    for (const dir of packageDirs) {
        if (dir.length > owner.length && file.startsWith(`${dir}/`)) {
            owner = dir;
        }
    }
    return owner;
}
