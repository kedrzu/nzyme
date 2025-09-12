export { checkoutBranch } from './utils/checkoutBranch.js';
export { checkoutExistingBranch } from './utils/checkoutExistingBranch.js';
export { checkUnpushedCommits } from './utils/checkUnpushedCommits.js';
export { convertPrToReady } from './utils/convertPrToReady.js';
export { createBranchAndPr } from './utils/createBranchAndPr.js';
export type { CreateBranchAndPrParams, CreateBranchAndPrResult } from './utils/createBranchAndPr.js';
export { createOctokitClient } from './utils/createOctokitClient.js';
export { findMatchingPr } from './utils/findMatchingPr.js';
export { createIssueIdRegex } from './utils/findMatchingPr.js';
export { getCurrentBranch } from './utils/getCurrentBranch.js';
export { getGitStatusInfo } from './utils/getGitStatusInfo.js';
export type { GitStatusInfo } from './utils/getGitStatusInfo.js';
export { applyStashedChanges, handleBranchSelection } from './utils/handleBranchSelection.js';
export type { BranchSelectionParams, BranchSelectionResult } from './utils/handleBranchSelection.js';
export { handleReadyPreparation } from './utils/handleReadyPreparation.js';
export { syncBaseBranch } from './utils/syncBaseBranch.js';
export type { SyncBaseBranchResult } from './utils/syncBaseBranch.js';

/**
 * Configuration for GitHub API access.
 */
export interface GitHubConfig {
    /**
     * GitHub API token.
     */
    token: string;

    /**
     * GitHub repository owner.
     */
    owner: string;

    /**
     * GitHub repository name.
     */
    repo: string;
}
