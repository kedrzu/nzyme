import { WebAPIPlatformError } from '@slack/web-api';
import type { ConversationsListResponse, UsersListResponse, UsersLookupByEmailResponse } from '@slack/web-api';
import { beforeEach, describe, expect, test } from 'bun:test';

import type { SlackDirectoryClient } from './fetchSlackDirectory.js';
import { resolveSlackTarget } from './resolveSlackTarget.js';

let usersListCalls: number;
let conversationsListCalls: number;
let lookupByEmailResult: () => Promise<UsersLookupByEmailResponse>;
let client: SlackDirectoryClient;

beforeEach(() => {
    usersListCalls = 0;
    conversationsListCalls = 0;
    lookupByEmailResult = () =>
        Promise.resolve({ ok: true, user: { id: 'U02FR4NK1', name: 'frank' } } satisfies UsersLookupByEmailResponse);

    // A fresh client each test — `fetchSlackDirectory`'s cache is keyed by client instance, so
    // reusing one across tests would leak a previous test's directory into the next.
    client = {
        users: {
            list: () => {
                usersListCalls += 1;
                return Promise.resolve({
                    ok: true,
                    members: [
                        member({ id: 'U02FR4NK1', name: 'frank', real_name: 'Frank Miller' }),
                        member({ id: 'U02FR4NK2', name: 'frankie', real_name: 'Frank Lopez' }),
                        member({ id: 'U02JANE1', name: 'jane', real_name: 'Jane Doe' }),
                    ],
                } satisfies UsersListResponse);
            },
            lookupByEmail: () => lookupByEmailResult(),
        },
        conversations: {
            list: () => {
                conversationsListCalls += 1;
                return Promise.resolve({
                    ok: true,
                    channels: [
                        channel({ id: 'C01ENGCORE', name: 'eng-core', purpose: 'General engineering' }),
                        channel({ id: 'C01ENGPLAT', name: 'eng-platform', purpose: 'Backend team' }),
                    ],
                } satisfies ConversationsListResponse);
            },
        },
    };
});

describe('resolveSlackTarget', () => {
    test('resolves a raw id without calling Slack', async () => {
        const result = await resolveSlackTarget(client, 'U0APV67CQKT');

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'person', id: 'U0APV67CQKT' } });
        expect(usersListCalls).toBe(0);
        expect(conversationsListCalls).toBe(0);
    });

    test('resolves a channel id without calling Slack', async () => {
        const result = await resolveSlackTarget(client, 'C0123ABCDE');

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'channel', id: 'C0123ABCDE' } });
        expect(usersListCalls).toBe(0);
        expect(conversationsListCalls).toBe(0);
    });

    test('resolves a permalink to its channel without calling Slack', async () => {
        const result = await resolveSlackTarget(
            client,
            'https://sigma-health.slack.com/archives/C01ENGPLAT/p1700000000000000',
        );

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'channel', id: 'C01ENGPLAT' } });
        expect(conversationsListCalls).toBe(0);
    });

    test('resolves an email through users.lookupByEmail, unambiguously', async () => {
        const result = await resolveSlackTarget(client, 'frank@healed.care');

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'person', id: 'U02FR4NK1' } });
        expect(usersListCalls).toBe(0);
    });

    test('an email nobody has is not found, not an error', async () => {
        lookupByEmailResult = () => Promise.reject(new WebAPIPlatformError({ ok: false, error: 'users_not_found' }));

        const result = await resolveSlackTarget(client, 'nobody@healed.care');

        expect(result).toEqual({ outcome: 'not_found' });
    });

    test('a unique handle resolves to that person', async () => {
        const result = await resolveSlackTarget(client, '@jane');

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'person', id: 'U02JANE1' } });
    });

    test('a unique channel name resolves to that channel', async () => {
        const result = await resolveSlackTarget(client, '#eng-core');

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'channel', id: 'C01ENGCORE' } });
    });

    test('a free-text query matching exactly one entry resolves it', async () => {
        const result = await resolveSlackTarget(client, 'jane');

        expect(result).toEqual({ outcome: 'resolved', target: { kind: 'person', id: 'U02JANE1' } });
    });

    // This is the behaviour the task's "Must protect" guarantee is about: several candidates must
    // never collapse into a silent pick. A future edit that reaches for `candidates[0]` here would
    // fail this test immediately.
    test('a free-text query matching several people is reported as ambiguous, never resolved to one', async () => {
        const result = await resolveSlackTarget(client, 'frank');

        expect(result.outcome).toBe('ambiguous');
        if (result.outcome !== 'ambiguous') {
            throw new Error('expected ambiguous outcome');
        }
        expect(result.candidates.map(candidate => candidate.id).toSorted()).toEqual(['U02FR4NK1', 'U02FR4NK2']);
    });

    test('a free-text query matching a person and a channel is reported as ambiguous across kinds', async () => {
        const result = await resolveSlackTarget(client, 'eng');

        expect(result.outcome).toBe('ambiguous');
        if (result.outcome !== 'ambiguous') {
            throw new Error('expected ambiguous outcome');
        }
        expect(result.candidates.map(candidate => candidate.id).toSorted()).toEqual(['C01ENGCORE', 'C01ENGPLAT']);
    });

    test('a free-text query matching nothing is reported as not found', async () => {
        const result = await resolveSlackTarget(client, 'nonexistent-target-zzz');

        expect(result).toEqual({ outcome: 'not_found' });
    });

    test('a well-formed id with an unrecognised prefix is not found', async () => {
        const result = await resolveSlackTarget(client, 'T0ANWNQ4JR1');

        expect(result).toEqual({ outcome: 'not_found' });
    });
});

function member(overrides: {
    id: string;
    name: string;
    real_name: string;
}): NonNullable<UsersListResponse['members']>[number] {
    return { deleted: false, is_bot: false, ...overrides };
}

function channel(overrides: {
    id: string;
    name: string;
    purpose: string;
}): NonNullable<ConversationsListResponse['channels']>[number] {
    return {
        is_private: false,
        purpose: { value: overrides.purpose },
        id: overrides.id,
        name: overrides.name,
    };
}
