import { Project } from '@lerna/project';

/**
 * Options for getting a project.
 */
export type ProjectOptions = {
    /**
     * The working directory to get the project from.
     */
    cwd?: string;
};

/**
 * Get a project.
 */
export function getProject(options: ProjectOptions = {}) {
    const cwd = options.cwd || process.cwd();
    return new Project(cwd);
}
