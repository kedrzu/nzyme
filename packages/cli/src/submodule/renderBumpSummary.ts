import type { BumpChanged } from './bumpSubmodule.js';

/** How many commits a summary lists before pointing at the compare view for the rest. */
export const MAX_LISTED_COMMITS = 50;

/** Length of the abbreviated SHAs shown in a summary. */
const SHORT_SHA_LENGTH = 7;

/**
 * Renders a bump as markdown for the bump PR's body: old → new, a compare link when the submodule
 * is on GitHub, the commits it brings in and a warning when it drops commits of the previous pin.
 *
 * Reviewers of a bump PR are looking at the product repository, so issue references in commit
 * subjects (`(#123)`, the squash-merge suffix) are qualified with the submodule's repository —
 * unqualified they would link to the product's own PR #123.
 */
export function renderBumpSummary(bump: BumpChanged): string {
    const { submodulePath, source, previous, current, commits, droppedCount, repoUrl } = bump;
    const repoName = repoUrl?.replace('https://github.com/', '') ?? null;
    const compareUrl = repoUrl ? `${repoUrl}/compare/${previous}...${current}` : null;

    const lines = [
        `## \`${submodulePath}\`: \`${shortSha(previous)}\` → \`${shortSha(current)}\``,
        '',
        `Source: \`${source}\`${compareUrl ? ` · [compare](${compareUrl})` : ''}`,
        '',
    ];

    if (droppedCount > 0) {
        lines.push(
            '> [!WARNING]',
            `> The new commit does not descend from the previous one: ${droppedCount} commit(s) of the previous`,
            '> pin are not in the new one. Merge only if dropping them is intended.',
            '',
        );
    }

    lines.push(`${commits.length} new commit(s):`, '');
    for (const commit of commits.slice(0, MAX_LISTED_COMMITS)) {
        const sha = repoUrl
            ? `[\`${shortSha(commit.sha)}\`](${repoUrl}/commit/${commit.sha})`
            : `\`${shortSha(commit.sha)}\``;
        lines.push(`- ${sha} ${qualifyIssueReferences(commit.subject, repoName)}`);
    }

    const hidden = commits.length - MAX_LISTED_COMMITS;
    if (hidden > 0) {
        lines.push(`- … and ${hidden} more${compareUrl ? ` — see [the full comparison](${compareUrl})` : ''}`);
    }

    return lines.join('\n') + '\n';
}

/** The abbreviated form of a commit SHA. */
function shortSha(sha: string): string {
    return sha.slice(0, SHORT_SHA_LENGTH);
}

/** Rewrites bare `#123` references to `owner/repo#123`, so they link to the submodule's repository. */
function qualifyIssueReferences(subject: string, repoName: string | null): string {
    if (!repoName) {
        return subject;
    }

    return subject.replace(/(^|[\s(])#(\d+)\b/g, `$1${repoName}#$2`);
}
