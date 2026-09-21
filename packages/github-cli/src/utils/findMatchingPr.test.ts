import { describe, expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr, findPrForBranch, findTaskPrs, resolveNodePr } from './findMatchingPr.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'widgets', token: 'ghp_test' };

interface FakePr {
    number: number;
    title: string;
    branch: string;
    state?: 'closed' | 'open';
    mergedAt?: string | null;
    updatedAt?: string;
}

/**
 * Build a client whose `pulls.list` answers with the given PRs, split by the `state` parameter the
 * way the real endpoint does.
 */
function createClient(prs: FakePr[]): GithubClient {
    const data = prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state ?? 'open',
        merged_at: pr.mergedAt ?? null,
        updated_at: pr.updatedAt ?? '2026-08-01T00:00:00Z',
        head: { ref: pr.branch },
        base: { ref: 'main' },
        draft: false,
        html_url: `https://github.com/acme/widgets/pull/${pr.number}`,
    }));

    return {
        rest: {
            pulls: {
                list(params: { state: string }) {
                    return Promise.resolve({
                        data: data.filter(pr =>
                            params.state === 'open' ? pr.state === 'open' : pr.state === 'closed',
                        ),
                    });
                },
            },
        },
    } as unknown as GithubClient;
}

describe('findTaskPrs', () => {
    test('returns the single open PR of an ordinary task', async () => {
        const client = createClient([{ number: 1, title: '[ABC-123] Thing', branch: 'abc-123-thing' }]);

        const prs = await findTaskPrs(client, CONFIG, 'ABC-123');

        expect(prs.map(pr => pr.number)).toEqual([1]);
    });

    test('orders stack nodes bottom to top regardless of listing order', async () => {
        const client = createClient([
            { number: 3, title: '[ABC-123] Thing — UI', branch: 'abc-123-thing--s3' },
            { number: 1, title: '[ABC-123] Thing — schema', branch: 'abc-123-thing' },
            { number: 2, title: '[ABC-123] Thing — API', branch: 'abc-123-thing--s2' },
        ]);

        const prs = await findTaskPrs(client, CONFIG, 'ABC-123');

        expect(prs.map(pr => pr.number)).toEqual([1, 2, 3]);
    });

    test('ignores merged and closed PRs, and other tasks', async () => {
        const client = createClient([
            { number: 1, title: '[ABC-123] Thing', branch: 'abc-123-thing' },
            { number: 2, title: '[ABC-123] Old', branch: 'abc-123-old', state: 'closed', mergedAt: '2026-07-01' },
            { number: 3, title: '[ABC-456] Other', branch: 'abc-456-other' },
        ]);

        const prs = await findTaskPrs(client, CONFIG, 'ABC-123');

        expect(prs.map(pr => pr.number)).toEqual([1]);
    });
});

describe('resolveNodePr', () => {
    test('returns null when the task has no open PR', async () => {
        const client = createClient([]);

        expect(await resolveNodePr(client, CONFIG, 'ABC-123', 'abc-123-thing')).toBeNull();
    });

    test('returns the only PR whatever branch you stand on', async () => {
        // The backwards-compatibility case: an unstacked task behaves exactly as it did before
        // stacks existed, including from an unrelated branch.
        const client = createClient([{ number: 1, title: '[ABC-123] Thing', branch: 'abc-123-thing' }]);

        const pr = await resolveNodePr(client, CONFIG, 'ABC-123', 'some-other-branch');

        expect(pr?.number).toBe(1);
    });

    test('picks the node matching the current branch', async () => {
        const client = createClient([
            { number: 1, title: '[ABC-123] Thing — schema', branch: 'abc-123-thing' },
            { number: 2, title: '[ABC-123] Thing — API', branch: 'abc-123-thing--s2' },
        ]);

        const pr = await resolveNodePr(client, CONFIG, 'ABC-123', 'abc-123-thing--s2');

        expect(pr?.number).toBe(2);
    });

    test('refuses to guess when several nodes exist and none is checked out', async () => {
        const client = createClient([
            { number: 1, title: '[ABC-123] Thing — schema', branch: 'abc-123-thing' },
            { number: 2, title: '[ABC-123] Thing — API', branch: 'abc-123-thing--s2' },
        ]);

        await expect(resolveNodePr(client, CONFIG, 'ABC-123', 'main')).rejects.toThrow(UsageError);
    });
});

describe('findPrForBranch', () => {
    test('matches on the branch, not on the issue ID', async () => {
        const client = createClient([
            { number: 1, title: '[ABC-123] Thing — schema', branch: 'abc-123-thing' },
            { number: 2, title: '[ABC-123] Thing — API', branch: 'abc-123-thing--s2' },
        ]);

        expect((await findPrForBranch(client, CONFIG, 'ABC-123', 'abc-123-thing--s2'))?.number).toBe(2);
        expect(await findPrForBranch(client, CONFIG, 'ABC-123', 'abc-123-thing--s9')).toBeNull();
    });
});

describe('findMatchingPr', () => {
    test('still resolves an unstacked task to its single PR', async () => {
        const client = createClient([{ number: 1, title: '[ABC-123] Thing', branch: 'abc-123-thing' }]);

        expect((await findMatchingPr(client, CONFIG, 'ABC-123'))?.number).toBe(1);
    });
});
