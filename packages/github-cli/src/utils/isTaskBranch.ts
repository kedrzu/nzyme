/**
 * Check if a branch name appears to be a task/issue branch.
 * @__NO_SIDE_EFFECTS__
 */
export function isTaskBranch(branchName: string | undefined): boolean {
    if (!branchName) {
        return false;
    }

    // Check for common task branch patterns:
    // - feature/SIG-123-... or feature/sig-123-...
    // - bug/SIG-123-... or bug/sig-123-...
    // - SIG-123-... or sig-123-...
    // - Any branch containing task IDs like SIG-123, PROJ-456, etc. (case-insensitive)
    const taskIdPattern = /[A-Z]+-\d+/i;
    return taskIdPattern.test(branchName);
}
