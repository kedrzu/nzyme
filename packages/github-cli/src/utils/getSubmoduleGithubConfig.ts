import type { GithubConfig } from '../GithubConfig.js';

/**
 * Derive a {@link GithubConfig} for a submodule from its git remote URL.
 *
 * Submodule remotes appear as either `https://github.com/owner/repo(.git)` or
 * `git@github.com:owner/repo(.git)`; both forms are parsed. Returns `null` when the URL does not look
 * like a GitHub remote so callers can warn-and-skip rather than crash on an unexpected submodule.
 * @__NO_SIDE_EFFECTS__
 */
export function getSubmoduleGithubConfig(submoduleUrl: string, token: string): GithubConfig | null {
    const urlMatch = submoduleUrl.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!urlMatch) {
        return null;
    }

    const [, owner, repo] = urlMatch;
    if (!owner || !repo) {
        return null;
    }

    // The non-greedy repo group can still retain a trailing `.git` for some `git@` forms, so strip it
    // again to be safe (preserves the original inline behaviour this util was extracted from).
    return {
        owner,
        repo: repo.replace(/\.git$/, ''),
        token,
    };
}
