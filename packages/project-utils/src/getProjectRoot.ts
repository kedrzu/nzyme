import { findRootSync } from '@manypkg/find-root';

const projectRootCache = new Map<string, string>();

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
    const key = cwd ?? process.cwd();
    const cached = projectRootCache.get(key);
    if (cached) {
        return cached;
    }
    const result = findRootSync(key);
    if (!result) {
        throw new Error(`No project root found from ${cwd}`);
    }
    projectRootCache.set(key, result.rootDir);
    return result.rootDir;
}
