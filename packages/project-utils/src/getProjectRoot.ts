import { findRootSync } from '@manypkg/find-root';

import { createCache } from '@nzyme/utils/createCache.js';

const projectRoots = createCache({
    getValue: (cwd: string) => {
        const result = findRootSync(cwd);
        if (!result) {
            throw new Error(`No project root found from ${cwd}`);
        }

        return result.rootDir;
    },
});

/**
 * Get the root directory of the project (monorepo or package).
 * Caches the result for each cwd for performance.
 * Throws if no project root is found.
 * @param cwd - The current working directory to resolve from.
 * @returns The absolute path to the project root directory.
 * @throws {Error} If no project root is found.
 * @__NO_SIDE_EFFECTS__
 */
export function getProjectRoot(cwd?: string): string {
    return projectRoots.get(cwd ?? process.cwd());
}
