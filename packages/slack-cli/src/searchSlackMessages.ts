import type { SearchMessagesResponse, WebClient } from '@slack/web-api';

import { extractSlackMessageBody } from '@nzyme/slack/utils/extractSlackMessageBody.js';
import { assert } from '@nzyme/utils/assert.js';

import type { SlackMessageRecord, SlackMessagesOmission } from './formatSlackMessages.js';

/** The subset of `WebClient` search needs — narrow enough that a test can pass a plain fake. */
export interface SlackSearchClient {
    search: Pick<WebClient['search'], 'messages'>;
}

export interface SearchSlackMessagesParams {
    client: SlackSearchClient;
    query: string;
    limit: number;
}

export interface SearchSlackMessagesResult {
    matches: SlackMessageRecord[];
    omission: SlackMessagesOmission;
}

type SearchMatch = NonNullable<NonNullable<SearchMessagesResponse['messages']>['matches']>[number];

/**
 * Runs `search.messages` for the developer's own account — it covers DMs and private channels the
 * token can see, not just what a bot could reach. Caps the result at `limit` even when Slack's
 * `total` reports more, and always carries that total forward as an exact omission count, per the
 * `formatSlackMessages` contract.
 */
export async function searchSlackMessages(params: SearchSlackMessagesParams): Promise<SearchSlackMessagesResult> {
    const { client, query, limit } = params;
    const response = await client.search.messages({ query, count: limit });

    const matches = (response.messages?.matches ?? []).map(toMessageRecord);
    const totalCount = response.messages?.total ?? matches.length;
    const omittedCount = totalCount - matches.length;

    return {
        matches,
        omission: omittedCount > 0 ? { kind: 'exact', count: omittedCount } : { kind: 'none' },
    };
}

function toMessageRecord(match: SearchMatch): SlackMessageRecord {
    assert(match.ts, 'search.messages match missing a ts');

    return {
        ts: match.ts,
        authorId: match.user,
        authorFallbackName: match.username,
        body: extractSlackMessageBody(match),
        // The one Slack itself returned for this match — never hand-assembled.
        permalink: match.permalink,
    };
}
