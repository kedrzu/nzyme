import type { LinearClient } from '@linear/sdk';

import { UsageError } from '@nzyme/cli';

/**
 * Parameters for creating a Linear issue.
 */
export interface CreateLinearIssueParams {
    /**
     * Issue title.
     */
    title: string;

    /**
     * Project ID to create the issue in.
     */
    projectId: string;

    /**
     * Issue description (optional).
     */
    description?: string;

    /**
     * Team ID (optional - will use first team if not provided).
     */
    teamId?: string;
}

/**
 * Create a new Linear issue.
 */
export async function createLinearIssue(linearClient: LinearClient, params: CreateLinearIssueParams): Promise<string> {
    let teamId = params.teamId;

    // If no team ID provided, get the first team
    if (!teamId) {
        const teams = await linearClient.teams();
        const firstTeam = teams.nodes[0];

        if (!firstTeam) {
            throw new UsageError('No teams found in Linear workspace');
        }

        teamId = firstTeam.id;
    }

    // Create the issue
    const issuePayload = await linearClient.createIssue({
        title: params.title,
        description: params.description,
        projectId: params.projectId,
        teamId,
    });

    if (!issuePayload.success || !issuePayload.issue) {
        throw new UsageError('Failed to create Linear issue');
    }

    // Return the issue identifier (e.g., "SIG-123")
    const issue = await issuePayload.issue;
    return issue.identifier;
}
