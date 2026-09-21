import { UsageError } from '@nzyme/cli';

/**
 * Extract task ID from a branch name.
 * Supports various branch naming conventions like:
 * - ABC-123-feature-name
 * - feature/ABC-123-something
 * - feature/abc-123-something
 * - ABC-123
 * - fix/ABC-123
 * @__NO_SIDE_EFFECTS__
 */
export function extractTaskIdFromBranch(branchName: string): string {
    // Pattern to match Linear task IDs (TEAM-NUMBER format)
    const taskIdPattern = /\b([a-zA-Z]+-\d+)\b/;
    const match = branchName.match(taskIdPattern);

    if (!match) {
        throw new UsageError(
            `Could not extract task ID from branch name "${branchName}". ` +
                'Branch name should contain a Linear task ID (e.g., ABC-123).',
        );
    }

    return match[1]!.toUpperCase();
}
