import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * A single pull request as it appears inside a stack payload.
 */
export interface StackPullRequest {
    number: number;
    state: 'closed' | 'open';
    draft: boolean;
    mergedAt: string | null;
    headRef: string;
    headSha: string;
}

/**
 * A stack of dependent pull requests, as returned by GitHub's Stacks API.
 */
export interface PullRequestStack {
    /**
     * Repository-scoped stack number, the identifier shown in the GitHub UI.
     */
    number: number;

    /**
     * Branch the whole stack ultimately lands on (e.g. `main`).
     */
    base: string;

    /**
     * Whether the stack still has unmerged pull requests.
     */
    open: boolean;

    /**
     * Pull requests ordered bottom to top — index 0 merges first.
     */
    pullRequests: StackPullRequest[];
}

/**
 * Status of an asynchronous merge started via {@link mergeStackAsync}.
 */
export type MergeAsyncStatus = 'enqueued' | 'failed' | 'merged' | 'pending';

/**
 * Raw shape of the stack resource. Declared locally because the Stacks API shipped after
 * `@octokit/rest` 22, so these routes have no generated types yet and `client.request` returns an
 * untyped payload for them.
 */
interface StackResponse {
    number: number;
    base: { ref: string };
    open: boolean;
    pull_requests: {
        number: number;
        state: 'closed' | 'open';
        draft: boolean;
        merged_at: string | null;
        head: { ref: string; sha: string };
    }[];
}

/**
 * Raw shape of the async-merge status resource.
 */
interface MergeAsyncResponse {
    uuid?: string;
    status?: MergeAsyncStatus;
    message?: string;
}

/**
 * Perform a request against a route `@octokit/rest` has no types for, and hand the caller the shape
 * it declared. The Stacks endpoints are newer than the pinned Octokit version, so this is the one
 * place where the untyped payload is narrowed — every caller works with a declared interface.
 */
async function requestUntyped<T>(
    client: GithubClient,
    route: string,
    params: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
    const response = await client.request(route, params);
    return { data: response.data as T, status: response.status };
}

/**
 * Convert the raw stack payload into the camel-cased shape used across the CLI.
 * @__NO_SIDE_EFFECTS__
 */
function toStack(data: StackResponse): PullRequestStack {
    return {
        number: data.number,
        base: data.base.ref,
        open: data.open,
        pullRequests: data.pull_requests.map(pr => ({
            number: pr.number,
            state: pr.state,
            draft: pr.draft,
            mergedAt: pr.merged_at,
            headRef: pr.head.ref,
            headSha: pr.head.sha,
        })),
    };
}

/**
 * Find the stack a pull request belongs to, or `null` when it is a plain, unstacked PR.
 *
 * This is the single detection point for stack-awareness: commands branch on the result of this
 * call rather than on a flag or on local state, so a pull request created before stacks existed —
 * or one a human stacked in the GitHub UI — is classified correctly without anything stored locally.
 */
export async function findStackForPr(
    client: GithubClient,
    config: GithubConfig,
    prNumber: number,
): Promise<PullRequestStack | null> {
    const { data } = await requestUntyped<StackResponse[]>(client, 'GET /repos/{owner}/{repo}/stacks', {
        owner: config.owner,
        repo: config.repo,
        pull_request: prNumber,
    });

    const stack = data[0];
    return stack ? toStack(stack) : null;
}

/**
 * Create a stack from an ordered list of pull requests (bottom first).
 */
export async function createStack(
    client: GithubClient,
    config: GithubConfig,
    pullRequests: number[],
): Promise<PullRequestStack> {
    const { data } = await requestUntyped<StackResponse>(client, 'POST /repos/{owner}/{repo}/stacks', {
        owner: config.owner,
        repo: config.repo,
        pull_requests: pullRequests,
    });

    return toStack(data);
}

/**
 * Append pull requests to the top of an existing stack.
 */
export async function addPrsToStack(
    client: GithubClient,
    config: GithubConfig,
    stackNumber: number,
    pullRequests: number[],
): Promise<PullRequestStack> {
    const { data } = await requestUntyped<StackResponse>(
        client,
        'POST /repos/{owner}/{repo}/stacks/{stack_number}/add',
        {
            owner: config.owner,
            repo: config.repo,
            stack_number: stackNumber,
            pull_requests: pullRequests,
        },
    );

    return toStack(data);
}

/**
 * Remove pull requests from a stack. Returns the remaining stack, or `null` when removing them
 * dissolved it and the pull requests went back to being ordinary, independent PRs.
 */
export async function unstackPrs(
    client: GithubClient,
    config: GithubConfig,
    stackNumber: number,
    pullRequests: number[],
): Promise<PullRequestStack | null> {
    const { data, status } = await requestUntyped<StackResponse | undefined>(
        client,
        'POST /repos/{owner}/{repo}/stacks/{stack_number}/unstack',
        {
            owner: config.owner,
            repo: config.repo,
            stack_number: stackNumber,
            pull_requests: pullRequests,
        },
    );

    if (status === 204 || !data) {
        return null;
    }

    return toStack(data);
}

/**
 * Start an asynchronous squash merge of a stack.
 *
 * Merging the top pull request lands every pull request below it too, each as its own squash commit
 * on the base branch and in stack order — which is why the whole chain needs only this one call.
 * The legacy synchronous merge endpoint cannot merge stacked pull requests, so this is not
 * interchangeable with {@link mergePullRequestSquash}.
 *
 * Returns the UUID to poll with {@link getMergeAsyncStatus}.
 */
export async function mergeStackAsync(
    client: GithubClient,
    config: GithubConfig,
    prNumber: number,
    headSha: string,
): Promise<string> {
    const { data } = await requestUntyped<MergeAsyncResponse>(
        client,
        'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async',
        {
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
            merge_method: 'squash',
            sha: headSha,
        },
    );

    if (!data.uuid) {
        throw new UsageError(`GitHub did not return a merge id for the stack merge of PR #${prNumber}.`);
    }

    return data.uuid;
}

/**
 * Read the status of an asynchronous merge started by {@link mergeStackAsync}.
 */
export async function getMergeAsyncStatus(
    client: GithubClient,
    config: GithubConfig,
    prNumber: number,
    uuid: string,
): Promise<{ status: MergeAsyncStatus; message?: string }> {
    const { data } = await requestUntyped<MergeAsyncResponse>(
        client,
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}',
        {
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
            uuid,
        },
    );

    return { status: data.status ?? 'pending', message: data.message };
}
