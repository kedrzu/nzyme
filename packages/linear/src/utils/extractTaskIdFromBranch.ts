import { UsageError } from '@nzyme/cli';

/**
 * Extract task ID from a branch name.
 * Supports various branch naming conventions like:
 * - SIG-123-feature-name
 * - feature/SIG-123-something
 * - feature/sig-123-something
 * - SIG-123
 * - fix/SIG-123
 * @__NO_SIDE_EFFECTS__
 */
export function extractTaskIdFromBranch(branchName: string): string {
    // Pattern to match Linear task IDs (TEAM-NUMBER format)
    const taskIdPattern = /\b([a-zA-Z]+-\d+)\b/;
    const match = branchName.match(taskIdPattern);

    if (!match) {
        throw new UsageError(
            `Could not extract task ID from branch name "${branchName}". ` +
                'Branch name should contain a Linear task ID (e.g., SIG-123).',
        );
    }

    return match[1]!.toUpperCase();
}
