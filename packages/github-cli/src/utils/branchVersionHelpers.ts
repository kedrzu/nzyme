/**
 * Suffix marking a branch's position in a stack of pull requests: `--s2` is the second node from
 * the bottom. The bottom node carries no suffix, so a task that never gets stacked keeps exactly
 * the branch name it has always had.
 */
const NODE_SUFFIX_PATTERN = /--s(\d+)$/;

/**
 * Suffix marking a re-opened task's branch version: `--v2` is the second attempt at the task.
 */
const VERSION_SUFFIX_PATTERN = /--v\d+$/;

/**
 * Strip the stack-node suffix from a branch name.
 * Example: "sig-123-feature--v2--s3" -> "sig-123-feature--v2"
 * @__NO_SIDE_EFFECTS__
 */
export function stripNodeSuffix(branchName: string): string {
    return branchName.replace(NODE_SUFFIX_PATTERN, '');
}

/**
 * Extract the 1-based stack position from a branch name.
 * Returns 1 for a branch with no node suffix — the bottom node, and also every unstacked branch.
 * @__NO_SIDE_EFFECTS__
 */
export function extractNodeIndex(branchName: string): number {
    const nodeMatch = branchName.match(NODE_SUFFIX_PATTERN);
    if (!nodeMatch) {
        return 1;
    }
    return Number.parseInt(nodeMatch[1]!, 10);
}

/**
 * Build the branch name for a given stack position, preserving any version suffix.
 * Example: ("sig-123-feature--v2", 3) -> "sig-123-feature--v2--s3"
 * @__NO_SIDE_EFFECTS__
 */
export function buildNodeBranchName(branchName: string, nodeIndex: number): string {
    const withoutNode = stripNodeSuffix(branchName);
    return nodeIndex <= 1 ? withoutNode : `${withoutNode}--s${nodeIndex}`;
}

/**
 * Extract the version number from a branch name.
 * Supports patterns like: branch-name--v2, branch-name--v3, etc.
 * Returns 1 if no version suffix is found (treating it as v1).
 * The node suffix is stripped first, so a stacked branch reports the version of its task.
 * @__NO_SIDE_EFFECTS__
 */
export function extractBranchVersion(branchName: string): number {
    const versionMatch = stripNodeSuffix(branchName).match(/--v(\d+)$/);
    if (!versionMatch) {
        return 1; // Default version
    }
    return Number.parseInt(versionMatch[1]!, 10);
}

/**
 * Get the base branch name without the version and stack-node suffixes.
 * Example: "sig-123-feature--v2--s3" -> "sig-123-feature"
 *
 * Both suffixes are stripped so that every branch belonging to the same task — re-opened versions
 * and stack nodes alike — collapses onto one name. Callers use this to group branches by task.
 * @__NO_SIDE_EFFECTS__
 */
export function getBaseBranchName(branchName: string): string {
    return stripNodeSuffix(branchName).replace(VERSION_SUFFIX_PATTERN, '');
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
