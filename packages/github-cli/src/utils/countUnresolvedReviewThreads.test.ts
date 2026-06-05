import { expect, test } from 'bun:test';

import type { GithubConfig } from '../GithubConfig.js';
import { countUnresolvedReviewThreads } from './countUnresolvedReviewThreads.js';
import type { GithubClient } from './createGithubClient.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'widgets', token: 'ghp_test' };

interface Page {
    nodes: { isResolved: boolean }[];
    hasNextPage: boolean;
    endCursor: string | null;
}

function createClient(pages: Page[]): GithubClient {
    let call = 0;
    return {
        async graphql() {
            const page = pages[call++]!;
            return {
                repository: {
                    pullRequest: {
                        reviewThreads: {
                            nodes: page.nodes,
                            pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
                        },
                    },
                },
            };
        },
    } as unknown as GithubClient;
}

test('counts unresolved threads across multiple pages', async () => {
    const client = createClient([
        {
            nodes: [{ isResolved: false }, { isResolved: true }, { isResolved: false }],
            hasNextPage: true,
            endCursor: 'cursor-1',
        },
        {
            nodes: [{ isResolved: true }, { isResolved: false }],
            hasNextPage: false,
            endCursor: null,
        },
    ]);

    expect(await countUnresolvedReviewThreads(client, CONFIG, 7)).toBe(3);
});

test('returns 0 when the GraphQL query throws', async () => {
    const client = {
        graphql() {
            return Promise.reject(new Error('Bad credentials'));
        },
    } as unknown as GithubClient;

    expect(await countUnresolvedReviewThreads(client, CONFIG, 7)).toBe(0);
});
