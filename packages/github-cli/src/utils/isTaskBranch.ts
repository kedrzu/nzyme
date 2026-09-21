/**
 * Check if a branch name appears to be a task/issue branch.
 * @__NO_SIDE_EFFECTS__
 */
export function isTaskBranch(branchName: string | undefined): boolean {
    if (!branchName) {
        return false;
    }

    // Check for common task branch patterns:
    // - feature/ABC-123-... or feature/abc-123-...
    // - bug/ABC-123-... or bug/abc-123-...
    // - ABC-123-... or abc-123-...
    // - Any branch containing task IDs like ABC-123, PROJ-456, etc. (case-insensitive)
    const taskIdPattern = /[A-Z]+-\d+/i;
    return taskIdPattern.test(branchName);
}
