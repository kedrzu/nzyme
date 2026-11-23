import { extractBranchVersion } from './branchVersionHelpers.js';

/**
 * Parameters for building a task pull request title.
 */
export interface BuildTaskPrTitleParams {
    issueId: string;
    issueTitle: string;
    projectName?: string;

    /**
     * The branch the PR is opened from; a `--vN` version above 1 becomes a ` (vN)` suffix.
     */
    branchName: string;
}

/**
 * Build the title of a task's pull request: `[ID][Project] Title`, with ` (vN)` for a re-opened
 * task's later versions so the attempts can be told apart.
 * @__NO_SIDE_EFFECTS__
 */
export function buildTaskPrTitle(params: BuildTaskPrTitleParams): string {
    const { issueId, issueTitle, projectName, branchName } = params;
    const version = extractBranchVersion(branchName);
    const versionSuffix = version > 1 ? ` (v${version})` : '';
    return projectName
        ? `[${issueId}][${projectName}] ${issueTitle}${versionSuffix}`
        : `[${issueId}] ${issueTitle}${versionSuffix}`;
}
