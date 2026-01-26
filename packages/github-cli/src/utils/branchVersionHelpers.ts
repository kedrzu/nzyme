/**
 * Extract the version number from a branch name.
 * Supports patterns like: branch-name--v2, branch-name--v3, etc.
 * Returns 1 if no version suffix is found (treating it as v1).
 * @__NO_SIDE_EFFECTS__
 */
export function extractBranchVersion(branchName: string): number {
    const versionMatch = branchName.match(/--v(\d+)$/);
    if (!versionMatch) {
        return 1; // Default version
    }
    return parseInt(versionMatch[1]!, 10);
}

/**
 * Get the base branch name without version suffix.
 * Example: "sig-123-feature--v2" -> "sig-123-feature"
 * @__NO_SIDE_EFFECTS__
 */
export function getBaseBranchName(branchName: string): string {
    return branchName.replace(/--v\d+$/, '');
}

/**
 * Increment the branch version by creating a new branch name with incremented version.
 * If the branch has no version, it becomes --v2.
 * If it has --v2, it becomes --v3, etc.
 * @__NO_SIDE_EFFECTS__
 */
export function incrementBranchVersion(branchName: string): string {
    const currentVersion = extractBranchVersion(branchName);
    const baseName = getBaseBranchName(branchName);
    const nextVersion = currentVersion + 1;
    return `${baseName}--v${nextVersion}`;
}

/**
 * Check if two branch names are versions of the same base branch.
 * @__NO_SIDE_EFFECTS__
 */
export function areSameBranchVersions(branch1: string, branch2: string): boolean {
    const base1 = getBaseBranchName(branch1);
    const base2 = getBaseBranchName(branch2);
    return base1 === base2;
}

/**
 * Determine the next version number based on existing branches.
 * Considers all provided branch names and returns the next version.
 * Example: if branches are ["sig-123", "sig-123--v2", "sig-123--v3"], returns "sig-123--v4"
 * @__NO_SIDE_EFFECTS__
 */
export function determineNextVersion(baseBranchName: string, existingBranches: string[]): string {
    const baseName = getBaseBranchName(baseBranchName);

    // Find all versions of this branch
    const versions = existingBranches
        .filter(branch => getBaseBranchName(branch) === baseName)
        .map(branch => extractBranchVersion(branch));

    if (versions.length === 0) {
        // No existing versions, use the base name as v1
        return baseName;
    }

    // Get the highest version and increment
    const maxVersion = Math.max(...versions);
    const nextVersion = maxVersion + 1;

    return `${baseName}--v${nextVersion}`;
}
