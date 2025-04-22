import type { ProjectOptions } from './getProject.js';
import { getProject } from './getProject.js';

const cache = new Map<string, string>();

/**
 * Get the root directory of the project.
 */
export function getProjectRoot(options: ProjectOptions = {}) {
    const cwd = options.cwd || process.cwd();
    const cached = cache.get(cwd);
    if (cached) {
        return cached;
    }

    const project = getProject(options);
    cache.set(cwd, project.rootPath);

    return project.rootPath;
}
