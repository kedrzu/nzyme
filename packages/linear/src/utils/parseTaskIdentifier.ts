import { UsageError } from '@nzyme/cli';

/**
 * Parse a task identifier into a standardized issue ID.
 * @__NO_SIDE_EFFECTS__
 */
export function parseTaskIdentifier(identifier: string, defaultPrefix?: string): string {
    // Handle Linear URL format: https://linear.app/team/issue/ISSUE-ID/...
    if (identifier.startsWith('https://linear.app/')) {
        const urlMatch = identifier.match(/\/issue\/([A-Z]+-\d+)/);
        if (urlMatch) {
            return urlMatch[1]!;
        }
        throw new UsageError(`Invalid Linear URL format: ${identifier}`);
    }

    // Handle issue ID with prefix (e.g., SIG-123)
    if (/^[A-Z]+-\d+$/.test(identifier)) {
        return identifier;
    }

    // Handle issue ID without prefix (e.g., 123)
    if (/^\d+$/.test(identifier)) {
        if (!defaultPrefix) {
            throw new UsageError(
                `Task ID ${identifier} requires a prefix. Please provide the full ID (e.g., FOO-${identifier}) or set a default prefix in options.`,
            );
        }
        return `${defaultPrefix}-${identifier}`;
    }

    throw new UsageError(
        `Invalid task identifier format: ${identifier}. Expected formats: TEAM-123, 123 (with default prefix), or Linear URL.`,
    );
}
