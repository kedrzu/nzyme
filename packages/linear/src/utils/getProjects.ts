import type { LinearClient } from '@linear/sdk';

/**
 * Project information for display in project selection.
 */
export interface ProjectInfo {
    /**
     * Project ID.
     */
    id: string;

    /**
     * Project name.
     */
    name: string;

    /**
     * Project state.
     */
    state: string;

    /**
     * Project completion status.
     */
    completedAt?: Date;
}

/**
 * Get all non-complete projects from Linear.
 */
export async function getNonCompleteProjects(linearClient: LinearClient): Promise<ProjectInfo[]> {
    // Get all projects
    const projects = await linearClient.projects();

    // Filter out completed projects and map to ProjectInfo
    const projectInfos: ProjectInfo[] = [];

    for (const project of projects.nodes) {
        if (!project.completedAt) {
            projectInfos.push({
                id: project.id,
                name: project.name,
                state: project.state,
                completedAt: project.completedAt ?? undefined,
            });
        }
    }

    return projectInfos;
}
