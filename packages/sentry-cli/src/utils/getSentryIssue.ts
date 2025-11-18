import { UsageError } from '@nzyme/cli';

import type { SentryApiClient } from './createSentryClient.js';

/**
 * Sentry issue data structure.
 */
export interface SentryIssue {
    /**
     * Unique issue ID.
     */
    id: string;

    /**
     * Short issue ID (e.g., MYPROJECT-123).
     */
    shortId: string;

    /**
     * Issue title/message.
     */
    title: string;

    /**
     * Issue type (error, performance, etc.).
     */
    type: string;

    /**
     * Issue status (resolved, unresolved, etc.).
     */
    status: string;

    /**
     * Issue level (error, warning, info, etc.).
     */
    level: string;

    /**
     * Number of times this issue has occurred.
     */
    count: string;

    /**
     * First seen timestamp.
     */
    firstSeen: string;

    /**
     * Last seen timestamp.
     */
    lastSeen: string;

    /**
     * Issue permalink URL.
     */
    permalink: string;

    /**
     * Project information.
     */
    project: {
        id: string;
        name: string;
        slug: string;
    };

    /**
     * Metadata about the issue.
     */
    metadata?: {
        title?: string;
        type?: string;
        value?: string;
    };
}

/**
 * Get details of a Sentry issue by ID.
 * @__NO_SIDE_EFFECTS__
 */
export async function getSentryIssue(
    client: SentryApiClient,
    organizationSlug: string,
    issueId: string,
): Promise<SentryIssue> {
    try {
        const issue = await client.get<SentryIssue>(`/organizations/${organizationSlug}/issues/${issueId}/`);
        return issue;
    } catch (error) {
        throw new UsageError(`Failed to fetch Sentry issue ${issueId}: ${(error as Error).message}`);
    }
}
