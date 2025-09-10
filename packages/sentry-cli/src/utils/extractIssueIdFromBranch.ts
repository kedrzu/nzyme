import { UsageError } from '@nzyme/cli';

/**
 * Extract Sentry issue ID from a branch name.
 * Supports various branch naming conventions like:
 * - MYPROJECT-123-feature-name
 * - feature/MYPROJECT-123-something
 * - MYPROJECT-123
 * - fix/MYPROJECT-123
 * @__NO_SIDE_EFFECTS__
 */
export function extractIssueIdFromBranch(branchName: string): string {
    // Pattern to match Sentry issue IDs (PROJECT-NUMBER format, case insensitive)
    const issueIdPattern = /\b([A-Z\d-]+)\b/;
    const match = branchName.match(issueIdPattern);

    if (!match) {
        throw new UsageError(
            `Could not extract issue ID from branch name "${branchName}". ` +
                'Branch name should contain a Sentry issue ID (e.g., MYPROJECT-123).',
        );
    }

    return match[1]!.toUpperCase();
}
