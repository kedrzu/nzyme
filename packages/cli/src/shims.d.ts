declare module '@lerna/filter-packages' {
    import type { Package } from '@lerna/package';

    /**
     * Filters a list of packages, returning all packages that match the `include` glob[s]
     * and do not match the `exclude` glob[s].
     *
     * @param {import("@lerna/package").Package[]} packagesToFilter The packages to filter
     * @param {string[]} [include] A list of globs to match the package name against
     * @param {string[]} [exclude] A list of globs to filter the package name against
     * @param {boolean} [showPrivate] When false, filter out private packages
     * @param {boolean} [continueIfNoMatch] When true, do not throw if no package is matched
     * @throws when a given glob would produce an empty list of packages and `continueIfNoMatch` is not set.
     */
    export function filterPackages(
        packagesToFilter: Package[],
        include: string[] = [],
        exclude: string[] = [],
        showPrivate?: boolean,
        continueIfNoMatch?: boolean,
    ): Package[];
}
